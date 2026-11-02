/** Runs the destructive steps only after a verified export path exists. */
export async function executeWipe(steps) {
  const exported = await steps.exportAll();
  if (!exported?.path) throw new Error("Firestore export failed.");
  await steps.revokeQuickBooks();
  await steps.deleteOtherCollections();
  await steps.deleteFluidlabStorage();
  await steps.deleteAuthUsers();
  await steps.createSuperAdmin();
  return exported.path;
}
