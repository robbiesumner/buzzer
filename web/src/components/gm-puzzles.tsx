/**
 * Authoring: the list of puzzles the room has, and the editor that fills one in.
 *
 * A puzzle is written once and sent when the room is ready for it, so the list
 * is the working surface — every row says what state it is in and offers only
 * the actions that state allows. Editing stops at the send, because the boards
 * on the phones are dealt out of the pairs.
 */
import { useState } from "react";
import { Button, Field, Eyebrow, Note, StepButton, TextButton } from "@/components/kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PUZZLE_MAX_PAIRS,
  PUZZLE_MIN_PAIRS,
  PUZZLE_TITLE_MAX,
  PUZZLE_WORD_MAX,
  type PuzzleDraftView,
} from "@/lib/protocol";
import { draftProblem, filledPairs, type PairDraft } from "@/lib/puzzle";
import { useSocket } from "@/lib/socket-provider";
import { t } from "@/i18n";

/** Three rows to start: enough to show what a pair is without a wall of inputs. */
const BLANK: PairDraft[] = [
  { first: "", second: "" },
  { first: "", second: "" },
  { first: "", second: "" },
];

interface Draft {
  id: string | null;
  title: string;
  pairs: PairDraft[];
}

export function GmPuzzles() {
  const { puzzles } = useSocket();
  const strings = t().gm.puzzles;
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <div className="space-y-4">
      {/* Over the list rather than instead of it: authoring a puzzle should not
          make the room's other puzzles disappear while you do it. */}
      <Dialog open={draft !== null} onOpenChange={(open) => open || setDraft(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{draft?.id ? strings.editorEdit : strings.editorNew}</DialogTitle>
          </DialogHeader>
          {draft ? <Editor draft={draft} onClose={() => setDraft(null)} /> : null}
        </DialogContent>
      </Dialog>

      <Button
        data-testid="puzzle-new"
        onClick={() => setDraft({ id: null, title: "", pairs: BLANK })}
      >
        {strings.create}
      </Button>

      {puzzles.length === 0 ? (
        <p className="py-8 text-center text-small text-faint">{strings.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {puzzles.map((puzzle) => (
            <PuzzleRow
              key={puzzle.id}
              puzzle={puzzle}
              onEdit={() =>
                setDraft({
                  id: puzzle.id,
                  title: puzzle.title,
                  pairs: puzzle.pairs.map((pair) => ({ ...pair })),
                })
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function PuzzleRow({ puzzle, onEdit }: { puzzle: PuzzleDraftView; onEdit: () => void }) {
  const { emit, participants } = useSocket();
  const strings = t().gm.puzzles;

  const status =
    puzzle.status === "live"
      ? strings.live
      : puzzle.status === "closed"
        ? strings.closed
        : strings.draft;

  return (
    <li data-testid="puzzle-row-gm" className="space-y-2 py-4">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-foreground">{puzzle.title}</span>
        <span
          className={`text-label font-medium tracking-label uppercase ${
            puzzle.status === "live" ? "text-brand" : "text-faint"
          }`}
        >
          {status}
        </span>
      </div>

      <p className="text-small text-muted-foreground">
        {strings.pairCount(puzzle.pairs.length)}
        {puzzle.status === "draft"
          ? null
          : ` · ${strings.submitted(puzzle.submissionCount, participants.length)}`}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <StepButton
          data-testid="puzzle-send"
          onClick={() => emit("puzzle:send", { puzzleId: puzzle.id })}
          disabled={puzzle.status === "live"}
        >
          {puzzle.status === "closed" ? strings.resend : strings.send}
        </StepButton>
        <StepButton
          data-testid="puzzle-close"
          onClick={() => emit("puzzle:close", { puzzleId: puzzle.id })}
          disabled={puzzle.status !== "live"}
        >
          {strings.close}
        </StepButton>
      </div>

      <div className="flex items-center gap-4">
        {/* Gone rather than refused once it is sent: the boards are made of
            these pairs, so changing them under the room is not an edit. */}
        {puzzle.status === "draft" ? (
          <TextButton onClick={onEdit}>{strings.edit}</TextButton>
        ) : (
          <Note>{strings.editLocked}</Note>
        )}
        {/* A real dialog rather than a second click on the same control: the
            old two-step reset itself `onBlur`, so scrolling the list silently
            disarmed it. */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <TextButton data-testid="puzzle-delete" className="ml-auto">
              {strings.delete}
            </TextButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{strings.deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription>{strings.deleteBody(puzzle.title)}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{strings.deleteCancel}</AlertDialogCancel>
              <AlertDialogAction
                data-testid="puzzle-delete-confirm"
                onClick={() => emit("puzzle:delete", { puzzleId: puzzle.id })}
              >
                {strings.deleteConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

function Editor({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const { emit } = useSocket();
  const strings = t().gm.puzzles;
  const [title, setTitle] = useState(draft.title);
  const [pairs, setPairs] = useState<PairDraft[]>(draft.pairs);
  const [problem, setProblem] = useState<string | null>(null);

  function setPair(index: number, half: "first" | "second", value: string) {
    setPairs((current) =>
      current.map((pair, at) => (at === index ? { ...pair, [half]: value } : pair)),
    );
  }

  function save() {
    const trouble = draftProblem(pairs);
    if (trouble) {
      setProblem(
        trouble === "needsPairs" ? strings.needsPairs(PUZZLE_MIN_PAIRS) : strings.duplicateWord,
      );
      return;
    }

    const body = { title: title.trim() || strings.title, pairs: filledPairs(pairs) };
    if (draft.id) emit("puzzle:update", { puzzleId: draft.id, ...body });
    else emit("puzzle:create", body);
    onClose();
  }

  return (
    <div className="space-y-4">
      <Field
        data-testid="puzzle-title"
        label={strings.titleField}
        placeholder={strings.titlePlaceholder}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={PUZZLE_TITLE_MAX}
        autoComplete="off"
      />

      <div className="space-y-2">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2">
          <Eyebrow>{strings.leftHeader}</Eyebrow>
          <Eyebrow>{strings.rightHeader}</Eyebrow>
          <span />
        </div>

        {pairs.map((pair, index) => (
          <div
            key={index}
            data-testid="pair-row"
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2"
          >
            <input
              aria-label={`${strings.leftHeader} ${index + 1}`}
              placeholder={strings.leftPlaceholder}
              value={pair.first}
              onChange={(event) => setPair(index, "first", event.target.value)}
              maxLength={PUZZLE_WORD_MAX}
              autoComplete="off"
              className="min-h-11 w-full rounded-sm border border-input bg-muted px-3
                text-body text-foreground outline-none focus:border-brand focus:bg-card"
            />
            <input
              aria-label={`${strings.rightHeader} ${index + 1}`}
              placeholder={strings.rightPlaceholder}
              value={pair.second}
              onChange={(event) => setPair(index, "second", event.target.value)}
              maxLength={PUZZLE_WORD_MAX}
              autoComplete="off"
              className="min-h-11 w-full rounded-sm border border-input bg-muted px-3
                text-body text-foreground outline-none focus:border-brand focus:bg-card"
            />
            <button
              type="button"
              aria-label={strings.removePair(index + 1)}
              onClick={() => setPairs((current) => current.filter((_, at) => at !== index))}
              className="min-h-11 text-faint transition-colors hover:text-danger"
            >
              ×
            </button>
          </div>
        ))}

        <TextButton
          data-testid="pair-add"
          onClick={() => setPairs((current) => [...current, { first: "", second: "" }])}
          disabled={pairs.length >= PUZZLE_MAX_PAIRS}
        >
          {strings.addPair}
        </TextButton>
      </div>

      {problem ? <Note className="text-danger">{problem}</Note> : null}

      <div className="grid grid-cols-2 gap-2">
        <Button data-testid="puzzle-save" onClick={save}>
          {strings.save}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {strings.cancel}
        </Button>
      </div>
    </div>
  );
}
