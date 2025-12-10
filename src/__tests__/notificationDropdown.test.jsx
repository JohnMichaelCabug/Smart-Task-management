import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import AdminDashboard from '../pages/AdminDashboard';

// Minimal mock for required props
const mockUser = { id: 'user-1', full_name: 'Test Admin', role: 'admin' };
const noop = () => {};

test('notification bell toggles dropdown in Admin header', async () => {
  render(<AdminDashboard user={mockUser} onLogout={noop} setViewingAsRole={noop} viewingAsRole={null} />);

  // find the bell button by its id
  const bellBtn = await screen.findByRole('button', { name: /notifications/i });
  expect(bellBtn).toBeInTheDocument();

  // click to open
  fireEvent.click(bellBtn);

  // the menu should be present
  const menu = await screen.findByRole('menu');
  expect(menu).toBeInTheDocument();

  // click again to close
  fireEvent.click(bellBtn);
  expect(menu).not.toBeVisible();
});
