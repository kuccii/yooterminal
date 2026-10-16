import React from 'react';

import AccountSettingsPanel from '@/components/account/AccountSettingsPanel';

export default function AccountSettings() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Account settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your display name, password, and session.
      </p>
      <AccountSettingsPanel className="mt-8" />
    </div>
  );
}
