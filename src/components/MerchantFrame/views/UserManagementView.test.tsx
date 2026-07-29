import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserManagementView } from './UserManagementView';
import {
  createUser,
  getCurrentMerchantId,
  getMerchantUsers,
  getUserHrSummary,
  setUserActiveStatus,
  triggerUserPasswordReset,
  updateUser,
} from '../../../api/users';
import type { MerchantUser } from '../../../types/user';

vi.mock('../../../api/users', () => ({
  getMerchantUsers: vi.fn(),
  getCurrentMerchantId: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  setUserActiveStatus: vi.fn(),
  triggerUserPasswordReset: vi.fn(),
  getUserHrSummary: vi.fn(),
}));

const MOCK_USERS: MerchantUser[] = [
  {
    id: 1,
    username: 'jdoe',
    email: 'john@acme.com',
    role: 'merchant_admin',
    scope: 'merchant_web',
    isActive: true,
    merchantId: 5,
  },
  {
    id: 2,
    username: 'asmith',
    email: 'anna@acme.com',
    role: 'merchant_user',
    scope: 'merchant_android',
    isActive: false,
    merchantId: 5,
  },
];

function renderView() {
  return render(
    <MemoryRouter>
      <UserManagementView />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(getMerchantUsers).mockResolvedValue(MOCK_USERS);
  vi.mocked(getCurrentMerchantId).mockReturnValue(5);
  vi.mocked(createUser).mockResolvedValue(MOCK_USERS[0]);
  vi.mocked(updateUser).mockResolvedValue(MOCK_USERS[0]);
  vi.mocked(setUserActiveStatus).mockResolvedValue(MOCK_USERS[0]);
  vi.mocked(triggerUserPasswordReset).mockResolvedValue({
    statusCode: 200,
    message: 'sent',
  });
  vi.mocked(getUserHrSummary).mockResolvedValue({
    user: MOCK_USERS[0],
    collaborators: [],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UserManagementView', () => {
  it('renders the loaded users', async () => {
    renderView();
    expect(await screen.findByText('jdoe')).toBeInTheDocument();
    expect(screen.getByText('john@acme.com')).toBeInTheDocument();
    expect(screen.getByText('asmith')).toBeInTheDocument();
  });

  it('shows the zero-match message when filters exclude everyone', async () => {
    renderView();
    await screen.findByText('jdoe');
    await userEvent.type(
      screen.getByPlaceholderText(/search by username or email/i),
      'zzzzz-nobody',
    );
    expect(
      await screen.findByText('No users match your criteria'),
    ).toBeInTheDocument();
  });

  it('opens the create modal from the floating action button', async () => {
    renderView();
    await screen.findByText('jdoe');
    // The FAB carries the exact accessible name "Add user".
    await userEvent.click(screen.getByRole('button', { name: 'Add user' }));
    expect(await screen.findByText('Add User')).toBeInTheDocument();
    expect(screen.getByLabelText(/security role/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/access scope/i)).toBeInTheDocument();
  });
});
