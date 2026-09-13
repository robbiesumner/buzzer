"""Generate the favicon set from web/buzzer.png:  python3 scripts/icons.py

Stdlib only, so it needs no Node and no Pillow.

The master is an app-icon squircle sitting on a white page, so the page white
has to come off or a 32px tab icon is a white square on dark browser chrome. It
is removed by flooding in from the border rather than by keying out white,
because the three "ding" ticks above the button are pure white too.
"""

from __future__ import annotations

import os
import struct
import zlib
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "buzzer.png")
OUT = os.path.join(HERE, "..", "public")

#: Anything at least this bright on every channel counts as the page.
WHITE = 242


def read_rgb(path: str) -> tuple[int, int, bytearray]:
    """Decode an 8-bit RGB PNG to raw bytes."""
    with open(path, "rb") as handle:
        data = handle.read()

    pos, idat = 8, bytearray()
    width = height = depth = colour = 0
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind, body = data[pos + 4 : pos + 8], data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, colour = struct.unpack(">IIBB", body[:10])
        elif kind == b"IDAT":
            idat += body
        pos += 12 + length
    if (depth, colour) != (8, 2):
        raise SystemExit(f"expected an 8-bit RGB PNG, got depth={depth} colour={colour}")

    raw, bpp, stride = zlib.decompress(bytes(idat)), 3, width * 3
    out, prev, read = bytearray(stride * height), bytearray(stride), 0
    for y in range(height):
        filter_kind = raw[read]
        read += 1
        line = bytearray(raw[read : read + stride])
        read += stride
        if filter_kind == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif filter_kind == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif filter_kind == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif filter_kind == 4:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                upleft = prev[i - bpp] if i >= bpp else 0
                up = prev[i]
                pa, pb, pc = abs(up - upleft), abs(left - upleft), abs(left + up - 2 * upleft)
                best = left if (pa <= pb and pa <= pc) else (up if pb <= pc else upleft)
                line[i] = (line[i] + best) & 255
        out[y * stride : (y + 1) * stride] = line
        prev = line
    return width, height, out


def write_rgba(path: str, size: int, pixels: bytearray) -> None:
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter: none
        raw += pixels[y * size * 4 : (y + 1) * size * 4]

    def chunk(kind: bytes, body: bytes) -> bytes:
        head = struct.pack(">I", len(body)) + kind + body
        return head + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as handle:
        handle.write(png)


def flood_page(width: int, height: int, rgb: bytearray) -> bytearray:
    """Mark every pixel reachable from the border without crossing the icon."""
    outside = bytearray(width * height)
    queue: deque[int] = deque()

    def is_page(i: int) -> bool:
        return rgb[i * 3] >= WHITE and rgb[i * 3 + 1] >= WHITE and rgb[i * 3 + 2] >= WHITE

    border = [(x, y) for x in range(width) for y in (0, height - 1)]
    border += [(x, y) for y in range(height) for x in (0, width - 1)]
    for x, y in border:
        i = y * width + x
        if not outside[i] and is_page(i):
            outside[i] = 1
            queue.append(i)

    while queue:
        i = queue.popleft()
        x, y = i % width, i // width
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height:
                j = ny * width + nx
                if not outside[j] and is_page(j):
                    outside[j] = 1
                    queue.append(j)
    return outside


def downscale(buf: bytearray, src: int, dst: int) -> bytearray:
    """Area average — the right filter going from 1094px down to 32."""
    out = bytearray(dst * dst * 4)
    for oy in range(dst):
        sy0, sy1 = oy * src // dst, max(oy * src // dst + 1, (oy + 1) * src // dst)
        for ox in range(dst):
            sx0, sx1 = ox * src // dst, max(ox * src // dst + 1, (ox + 1) * src // dst)
            r = g = b = a = n = 0
            for sy in range(sy0, sy1):
                for sx in range(sx0, sx1):
                    o = (sy * src + sx) * 4
                    alpha = buf[o + 3]
                    r += buf[o] * alpha
                    g += buf[o + 1] * alpha
                    b += buf[o + 2] * alpha
                    a += alpha
                    n += 1
            o = (oy * dst + ox) * 4
            if a:
                out[o], out[o + 1], out[o + 2], out[o + 3] = r // a, g // a, b // a, a // n
    return out


def main() -> None:
    width, height, rgb = read_rgb(SRC)
    outside = flood_page(width, height, rgb)

    def column_used(x: int) -> bool:
        return any(not outside[y * width + x] for y in range(0, height, 4))

    def row_used(y: int) -> bool:
        return any(not outside[y * width + x] for x in range(0, width, 4))

    columns = [x for x in range(width) if column_used(x)]
    rows = [y for y in range(height) if row_used(y)]
    x0, x1, y0, y1 = columns[0], columns[-1], rows[0], rows[-1]
    side = max(x1 - x0 + 1, y1 - y0 + 1)
    x0 = max(0, x0 - (side - (x1 - x0 + 1)) // 2)
    y0 = max(0, y0 - (side - (y1 - y0 + 1)) // 2)
    side = min(side, width - x0, height - y0)
    print(f"cropped to {side}x{side} at ({x0},{y0})")

    def cropped(cut_corners: bool) -> bytearray:
        buf = bytearray(side * side * 4)
        for y in range(side):
            for x in range(side):
                i = (y + y0) * width + (x + x0)
                o = (y * side + x) * 4
                buf[o : o + 3] = rgb[i * 3 : i * 3 + 3]
                buf[o + 3] = 0 if (cut_corners and outside[i]) else 255
        return buf

    cut = cropped(True)  # browser tabs and the manifest
    flat = cropped(False)  # iOS renders alpha as black and masks it anyway

    os.makedirs(OUT, exist_ok=True)
    for name, size, buf in (
        ("favicon-16.png", 16, cut),
        ("favicon-32.png", 32, cut),
        ("icon-192.png", 192, cut),
        ("icon-512.png", 512, cut),
        ("apple-touch-icon.png", 180, flat),
    ):
        path = os.path.join(OUT, name)
        write_rgba(path, size, downscale(buf, side, size))
        print(f"  {name:<24} {os.path.getsize(path):>7} bytes")


if __name__ == "__main__":
    main()
