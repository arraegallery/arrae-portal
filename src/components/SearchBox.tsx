/** The search field in the admin header. Plain GET form, so it works without JavaScript too. */
export function SearchBox() {
  return (
    <form action="/admin/search" className="ml-auto" role="search">
      <input
        type="search"
        name="q"
        placeholder="Search artists, works, shows…"
        aria-label="Search"
        className="w-44 rounded-md bg-white px-3 py-1.5 text-sm ring-1 ring-line focus:outline-none focus:ring-ink xl:w-56"
      />
    </form>
  );
}
