// For scripts/page-keys.test.mjs: the shape of #140's Groceries page. Not part of the app.
export function Sample({ empty, open }: { empty: boolean; open: boolean }) {
  return (
    <Page>
      <CookingFab key="fab" slot="fixed" />
      <Navbar />
      {!empty && <Block key="head" />}
      {empty ? <EmptyState key="empty" /> : <List key="list" />}
      <ShopWeekPopup opened={open} />
    </Page>
  );
}

export function Steady() {
  // nothing here comes and goes, so nothing needs a key
  return (
    <Page>
      <Navbar />
      <List />
    </Page>
  );
}
