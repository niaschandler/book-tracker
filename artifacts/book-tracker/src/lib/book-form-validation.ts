/** Shared by the add and edit forms; optional fields remain optional. */
export function requiredBookErrors(title: string, author: string) {
  return {
    title: title.trim() ? undefined : "Please enter the book’s title.",
    author: author.split(";").some(name => name.trim())
      ? undefined
      : "Please enter at least one author’s name.",
  };
}
