import { Star } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetBookQueryKey, useSetBookStar, type Book } from "@workspace/api-client-react";
import { refreshLibrary } from "@/lib/library-cache";

export function StarBookButton({ book, compact = false }: { book: Book; compact?: boolean }) {
  const client = useQueryClient();
  const mutation = useSetBookStar({
    mutation: {
      onSuccess: async (updated) => {
        client.setQueryData(getGetBookQueryKey(updated.id), updated);
        await refreshLibrary(client);
      },
    },
  });
  const label = book.starred ? `Unstar ${book.title}` : `Star ${book.title}`;
  return <>
    <button
      type="button"
      aria-label={label}
      aria-pressed={book.starred}
      aria-busy={mutation.isPending}
      disabled={mutation.isPending}
      data-testid={`button-star-${book.id}`}
      onClick={() => mutation.mutate({ id: book.id, data: { starred: !book.starred } })}
      className={compact
        ? `absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full backdrop-blur-sm transition disabled:opacity-50 ${book.starred ? "bg-[#f3d997] text-[#73552d]" : "bg-[#f8f0dedd] text-[#758075] md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"}`
        : "rounded-full border border-[#d8d2c4] px-4 py-2 text-xs text-[#5e4232] disabled:opacity-50"}
    >
      <Star size={compact ? 15 : 14} className={compact ? "" : "mr-1 inline"} fill={book.starred ? "currentColor" : "none"} />
      {!compact && (mutation.isPending ? "Saving…" : book.starred ? "Starred" : "Star book")}
    </button>
    {mutation.isError && <span role="alert" className={compact
      ? "absolute inset-x-1 top-12 rounded-md bg-[#fff8ef] p-2 text-xs text-[#a7453c] shadow"
      : "block text-xs text-[#a7453c]"}>
      Could not update this star. Please try again.
    </span>}
  </>;
}
