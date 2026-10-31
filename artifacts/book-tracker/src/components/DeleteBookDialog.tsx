import { useQueryClient } from "@tanstack/react-query";
import { getGetBookQueryKey, useDeleteBook, type Book } from "@workspace/api-client-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { refreshLibrary } from "@/lib/library-cache";

type Props = {
  book: Pick<Book, "id" | "title"> | null;
  onClose: () => void;
  onDeleted: () => void;
};

export function DeleteBookDialog({ book, onClose, onDeleted }: Props) {
  const client = useQueryClient();
  const remove = useDeleteBook({
    mutation: {
      onSuccess: async (_result, { id }) => {
        await client.cancelQueries({ queryKey: getGetBookQueryKey(id) });
        await refreshLibrary(client);
        onDeleted();
        onClose();
        client.removeQueries({ queryKey: getGetBookQueryKey(id), exact: true });
      },
    },
  });
  const close = () => {
    if (remove.isPending) return;
    remove.reset();
    onClose();
  };

  return (
    <AlertDialog open={book !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <AlertDialogContent
        className="w-[calc(100%_-_2rem)] max-w-md rounded-[22px] border-[#d9d0bd] bg-[#faf8f1] text-[#263e34]"
        onEscapeKeyDown={(event) => { if (remove.isPending) event.preventDefault(); }}
        aria-busy={remove.isPending}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif text-3xl">Are you sure?</AlertDialogTitle>
          <AlertDialogDescription className="leading-6 text-[#657569]">
            Remove “{book?.title}” from your library? Its rating, reading dates,
            notes, and favorite will also be removed. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <p role="alert" className="text-sm text-[#a7453c]">
            Could not remove this book. Please try again, or refresh your library to check its status.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending} className="rounded-full">
            Keep book
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            className="rounded-full bg-[#a7453c] text-white hover:bg-[#89392f]"
            onClick={(event) => {
              event.preventDefault();
              if (book && !remove.isPending) remove.mutate({ id: book.id });
            }}
          >
            {remove.isPending ? "Removing…" : "Yes, remove book"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
