import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { AuthLayout } from '../components/AuthLayout';
import { ApiError, INVALID_CREDENTIALS_MESSAGE } from '../lib/api-error';
import {
  getRememberedLogin,
  isAuthenticated,
  saveAuthSession,
  saveRememberStation,
} from '../lib/auth-storage';
import {
  hasLoginFieldErrors,
  validateLoginForm,
  type LoginFieldErrors,
} from '../lib/login-validation';

function fieldClass(hasError: boolean): string {
  const base =
    'w-full pl-10 pr-4 py-3 border rounded-lg text-body-md text-text focus:ring-1 outline-none bg-white transition-all';
  return hasError
    ? `${base} border-error focus:ring-error focus:border-error`
    : `${base} border-border focus:ring-text focus:border-text`;
}

export function LoginPage() {
  const navigate = useNavigate();
  const rememberedLogin = getRememberedLogin();
  const [email, setEmail] = useState(rememberedLogin.email);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(rememberedLogin.rememberStation);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [touched, setTouched] = useState({ email: false, password: false });

  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  function validateAndSetErrors(
    nextEmail: string,
    nextPassword: string,
  ): LoginFieldErrors {
    const errors = validateLoginForm(nextEmail, nextPassword);
    setFieldErrors(errors);
    return errors;
  }

  function handleEmailBlur() {
    setTouched((prev) => ({ ...prev, email: true }));
    validateAndSetErrors(email, password);
  }

  function handlePasswordBlur() {
    setTouched((prev) => ({ ...prev, password: true }));
    validateAndSetErrors(email, password);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setTouched({ email: true, password: true });

    const errors = validateAndSetErrors(email, password);
    if (hasLoginFieldErrors(errors)) {
      return;
    }

    setLoading(true);

    try {
      const trimmedEmail = email.trim();
      const response = await login(trimmedEmail, password);
      saveAuthSession(
        response.access_token,
        response.refreshToken,
        response.user,
        remember,
      );
      saveRememberStation(trimmedEmail, remember);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError(INVALID_CREDENTIALS_MESSAGE);
      } else {
        setError(
          err instanceof Error ? err.message : 'Login failed. Please try again.',
        );
      }
      setPassword('');
    } finally {
      setLoading(false);
    }
  }

  const showEmailError = touched.email && fieldErrors.email;
  const showPasswordError = touched.password && fieldErrors.password;

  return (
    <AuthLayout showPromo>
      <div className="surface-paper login-shadow rounded-lg overflow-hidden w-full">
        <div className="p-8 text-center border-b border-border bg-[#f9f7f4]">
          <div className="flex flex-col items-center py-4">
            <img
              alt="X7 Point of Sale"
              className="mx-auto w-full max-w-[180px] h-auto object-contain mb-6"
              src="/logo-card.svg"
            />
            <h2 className="text-h2 text-text font-semibold mb-1">
              Welcome Back
            </h2>
            <p className="text-body-md text-text/60">
              Access your restaurant management dashboard
            </p>
          </div>
        </div>

        <form className="p-8 space-y-6" noValidate onSubmit={handleSubmit}>
          {error && (
            <div
              className="rounded-lg border border-error/30 bg-red-50 px-4 py-3 text-body-sm text-error"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-label-caps text-text block" htmlFor="email">
              Email Address
            </label>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text/40 text-lg">
                mail
              </span>
              <input
                aria-describedby={showEmailError ? 'email-error' : undefined}
                aria-invalid={showEmailError ? 'true' : 'false'}
                autoComplete="email"
                className={fieldClass(Boolean(showEmailError))}
                id="email"
                onBlur={handleEmailBlur}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (touched.email) {
                    validateAndSetErrors(e.target.value, password);
                  }
                }}
                placeholder="chef@x7kitchen.com"
                type="email"
                value={email}
              />
            </div>
            {showEmailError && (
              <p
                className="text-body-sm text-error mt-1"
                id="email-error"
                role="alert"
              >
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label
                className="text-label-caps text-text block"
                htmlFor="password"
              >
                Password
              </label>
              <Link
                className="text-body-sm text-primary-container font-semibold hover:underline"
                to="/forgot-password"
              >
                Forgot your password?
              </Link>
            </div>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text/40 text-lg">
                lock
              </span>
              <input
                aria-describedby={
                  showPasswordError ? 'password-error' : undefined
                }
                aria-invalid={showPasswordError ? 'true' : 'false'}
                autoComplete="current-password"
                className={`${fieldClass(Boolean(showPasswordError))} pr-12`}
                id="password"
                onBlur={handlePasswordBlur}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (touched.password) {
                    validateAndSetErrors(email, e.target.value);
                  }
                }}
                placeholder="••••••••"
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text/40 hover:text-text"
                onClick={() => setShowPassword((prev) => !prev)}
                type="button"
              >
                <span className="material-symbols-outlined text-lg">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            {showPasswordError && (
              <p
                className="text-body-sm text-error mt-1"
                id="password-error"
                role="alert"
              >
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <input
              checked={remember}
              className="w-4 h-4 text-primary-container border-border rounded focus:ring-primary-container"
              id="remember"
              onChange={(e) => setRemember(e.target.checked)}
              type="checkbox"
            />
            <label className="text-body-sm text-text/80" htmlFor="remember">
              Remember this station
            </label>
          </div>

          <button
            className="w-full bg-primary-container text-white py-4 text-body-md font-bold rounded-lg shadow-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={loading}
            type="submit"
          >
            {loading ? (
              <>
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-base animate-spin"
                >
                  progress_activity
                </span>
                Logging in...
              </>
            ) : (
              <>
                Login
                <span className="material-symbols-outlined text-base">
                  arrow_forward
                </span>
              </>
            )}
          </button>
        </form>

        <div className="px-8 pb-8 text-center">
          <p className="text-body-sm text-text/60">
            Don&apos;t have an account?{' '}
            <Link
              className="text-primary-container font-bold hover:underline"
              to="/register"
            >
              Register
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
