let pendingLocationEdit = null;

export function setPendingLocationEdit(update) {
  pendingLocationEdit = update;
}

export function consumePendingLocationEdit() {
  const update = pendingLocationEdit;
  pendingLocationEdit = null;
  return update;
}
