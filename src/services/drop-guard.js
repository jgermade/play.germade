// A file dropped outside a drop zone would be opened by the browser, leaving the page (and a
// game in the middle of it). Zones call preventDefault() themselves first; everywhere else the
// drop is refused, with the "no drop" cursor.
export function guardFileDrops(target = window) {
  const refuse = (event) => {
    if (event.defaultPrevented || !event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'none';
  };
  target.addEventListener('dragover', refuse);
  target.addEventListener('drop', refuse);
}
