/**
 * Authoring: the list of puzzles the room has, and the editor that fills one in.
 *
 * A puzzle is written once and sent when the room is ready for it, so the list
 * is the working surface — every row says what state it is in and offers only
 * the actions that state allows. Editing stops at the send, because the boards
 * on the phones are dealt out of the pairs.
 */
import { useState } from "react";
import { Button, ErrorNote, Field, Eyebrow, Note, StepButton, TextButton } from "@/components/kit";
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
import { draftProblem, pairsFrom, pairsToText, type DraftProblem } from "@/lib/puzzle";
import { useSocket } from "@/lib/socket-provider";
import { t } from "@/i18n";

interface Draft {
  id: string | null;
  title: string;
  /** The pairs as they are written: one to a line, two words to a comma. */
  pairs: string;
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
        onClick={() => setDraft({ id: null, title: "", pairs: "" })}
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
                  pairs: pairsToText(puzzle.pairs),
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
  const [pairs, setPairs] = useState(draft.pairs);
  const [problem, setProblem] = useState<DraftProblem | null>(null);

  function save() {
    const trouble = draftProblem(pairs);
    if (trouble) {
      setProblem(trouble);
      return;
    }

    const body = { title: title.trim() || strings.title, pairs: pairsFrom(pairs) };
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
        <Eyebrow>{strings.pairsField}</Eyebrow>
        {/* One box rather than two inputs a pair: a list of pairs almost always
            exists somewhere before it is a puzzle, and this takes the paste. */}
        <textarea
          data-testid="puzzle-pairs"
          aria-label={strings.pairsField}
          aria-describedby="puzzle-pairs-hint"
          placeholder={strings.pairsPlaceholder}
          value={pairs}
          onChange={(event) => {
            setPairs(event.target.value);
            // The complaint belongs to the text that earned it; a fresh look
            // happens on the next save, not on every keystroke.
            setProblem(null);
          }}
          // Tall enough for an ordinary puzzle whole, and draggable taller for
          // the long ones rather than sized to the ceiling for everybody.
          rows={8}
          spellCheck={false}
          autoComplete="off"
          className="w-full resize-y rounded-sm border border-input bg-muted px-3 py-2
            font-mono text-body leading-relaxed text-foreground outline-none
            focus:border-brand focus:bg-card"
        />
        <Note id="puzzle-pairs-hint">
          {strings.pairsHint(PUZZLE_MIN_PAIRS, PUZZLE_MAX_PAIRS)}
        </Note>
      </div>

      {problem ? (
        <ErrorNote data-testid="puzzle-problem">{complaint(problem)}</ErrorNote>
      ) : null}

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

/** Every complaint names where to look: which line, or which word came twice. */
function complaint(problem: DraftProblem): string {
  const strings = t().gm.puzzles;
  switch (problem.kind) {
    case "needsTwoWords":
      return strings.needsTwoWords(problem.line);
    case "wordTooLong":
      return strings.wordTooLong(problem.line, PUZZLE_WORD_MAX);
    case "needsPairs":
      return strings.needsPairs(PUZZLE_MIN_PAIRS);
    case "tooManyPairs":
      return strings.tooManyPairs(PUZZLE_MAX_PAIRS);
    case "duplicateWord":
      return strings.duplicateWord(problem.word);
  }
}
