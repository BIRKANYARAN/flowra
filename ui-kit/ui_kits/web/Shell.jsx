/* global React, Sidebar, Header */
function Shell({ user, active, onNav, onLogout, title, subtitle, headerAction, children }) {
  return (
    <div className="flex bg-gray-50 min-h-screen">
      <Sidebar active={active} onNav={onNav} user={user} onLogout={onLogout} />
      <main className="flex-1 min-w-0">
        <Header title={title} subtitle={subtitle} action={headerAction} />
        <div className="p-8 max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
window.Shell = Shell;
