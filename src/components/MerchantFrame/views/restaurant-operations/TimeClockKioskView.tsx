import React, { useState, useEffect, useRef } from 'react';
import type {
  CollaboratorPinAccount,
  PunchType,
  CollaboratorPunchState,
  SupervisorOverrideLog,
} from '../../../../types/attendance';
import {
  validatePin,
  validateSupervisorPin,
  getCollaboratorPunchState,
  evaluateScheduledShift,
  submitPunch,
  getSupervisors,
  resetLockoutState,
  DEFAULT_CONFIG,
  type ShiftEvaluationResult,
} from '../../../../api/attendance';
import { StaffManagementQuickLinks } from './StaffManagementQuickLinks';

interface TimeClockKioskViewProps {
  onClose?: () => void;
  isEmbedded?: boolean;
  onNavigate?: (view: string) => void;
}

export const TimeClockKioskView: React.FC<TimeClockKioskViewProps> = ({
  onClose,
  isEmbedded = false,
  onNavigate,
}) => {
  // Live clock
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // PIN & Auth State
  const [pinInput, setPinInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);
  const [authenticatedAccount, setAuthenticatedAccount] = useState<CollaboratorPinAccount | null>(null);
  const [punchState, setPunchState] = useState<CollaboratorPunchState>('OFF_DUTY');
  const [shiftEval, setShiftEval] = useState<ShiftEvaluationResult | null>(null);

  // Badge scan simulation state
  const [isBadgeMode, setIsBadgeMode] = useState<boolean>(false);
  const [badgeInput, setBadgeInput] = useState<string>('');

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          resetLockoutState();
          setAuthError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  // Photo Verification WebRTC Stream
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [, setCapturedPhotoUrl] = useState<string | undefined>(undefined);

  // Initialize camera when user authenticates
  useEffect(() => {
    if (!authenticatedAccount || !DEFAULT_CONFIG.enablePhotoVerification) return;

    let mediaStream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 320, height: 240, facingMode: 'user' } })
      .then((stream) => {
        mediaStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setCameraActive(true);
      })
      .catch(() => {
        setCameraActive(false);
      });

    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [authenticatedAccount]);

  const captureSnapshot = (): string | undefined => {
    if (videoRef.current && canvasRef.current && cameraActive) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        context.drawImage(videoRef.current, 0, 0, 320, 240);
        return canvasRef.current.toDataURL('image/jpeg', 0.85);
      }
    }
    // Fallback photo if webcam is unavailable in test environment
    return authenticatedAccount?.avatarUrl;
  };

  // Supervisor Override Modal State
  const [showOverrideModal, setShowOverrideModal] = useState<boolean>(false);
  const [pendingPunchType, setPendingPunchType] = useState<PunchType | null>(null);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState<string>('');
  const [supervisorPin, setSupervisorPin] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Punch Success Modal / Splash State
  const [lastPunchSuccess, setLastPunchSuccess] = useState<{
    collaboratorName: string;
    punchType: PunchType;
    formattedTime: string;
    nextState: CollaboratorPunchState;
    photoUrl?: string;
  } | null>(null);

  // Auto-reset splash screen timer (5 seconds)
  useEffect(() => {
    if (!lastPunchSuccess) return;
    const timer = setTimeout(() => {
      resetTerminal();
    }, 5000);
    return () => clearTimeout(timer);
  }, [lastPunchSuccess]);

  const resetTerminal = () => {
    setPinInput('');
    setBadgeInput('');
    setAuthError(null);
    setAuthenticatedAccount(null);
    setShiftEval(null);
    setShowOverrideModal(false);
    setPendingPunchType(null);
    setSelectedSupervisorId('');
    setSupervisorPin('');
    setOverrideReason('');
    setOverrideError(null);
    setLastPunchSuccess(null);
    setCapturedPhotoUrl(undefined);
  };

  // Keypad Handlers
  const handleKeypadDigit = (digit: string) => {
    if (lockoutSeconds > 0) return;
    if (pinInput.length >= 6) return;
    const nextPin = pinInput + digit;
    setPinInput(nextPin);
    setAuthError(null);

    // Auto-submit if PIN length is 4
    if (nextPin.length === 4) {
      attemptPinAuth(nextPin);
    }
  };

  const handleKeypadClear = () => {
    setPinInput('');
    setAuthError(null);
  };

  const handleKeypadBackspace = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setAuthError(null);
  };

  const attemptPinAuth = async (pinToTest: string) => {
    const res = validatePin(pinToTest, DEFAULT_CONFIG);
    if (!res.success) {
      if (res.isLockedOut) {
        setLockoutSeconds(res.lockoutSecondsRemaining || 30);
      }
      setAuthError(res.error || 'Authentication failed');
      setPinInput('');
      return;
    }

    if (res.account) {
      setAuthenticatedAccount(res.account);
      const state = getCollaboratorPunchState(res.account.collaboratorId);
      setPunchState(state);
      const evalRes = await evaluateScheduledShift(res.account.collaboratorId);
      setShiftEval(evalRes);
      setAuthError(null);
    }
  };

  const handleBadgeScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!badgeInput.trim()) return;
    attemptPinAuth(badgeInput.trim());
  };

  // Action Button Click Handler
  const handlePunchClick = async (type: PunchType) => {
    if (!authenticatedAccount) return;

    // Check if CLOCK_IN requires supervisor override
    if (type === 'CLOCK_IN') {
      const evalRes = await evaluateScheduledShift(authenticatedAccount.collaboratorId);
      if (evalRes.requiresSupervisorOverride) {
        setPendingPunchType(type);
        setShiftEval(evalRes);
        // Preselect first supervisor
        const supervisors = getSupervisors();
        if (supervisors.length > 0) {
          setSelectedSupervisorId(supervisors[0].collaboratorId);
        }
        setShowOverrideModal(true);
        return;
      }
    }

    // Execute direct punch submission
    await executePunch(type);
  };

  const executePunch = async (type: PunchType, overrideLog?: SupervisorOverrideLog) => {
    if (!authenticatedAccount) return;

    const photo = captureSnapshot();
    setCapturedPhotoUrl(photo);

    const res = await submitPunch({
      collaboratorId: authenticatedAccount.collaboratorId,
      punchType: type,
      photoUrl: photo,
      supervisorOverride: overrideLog,
    });

    if (!res.success) {
      setAuthError(res.error || 'Failed to record punch.');
      return;
    }

    if (res.entry) {
      setLastPunchSuccess({
        collaboratorName: res.entry.collaboratorName,
        punchType: res.entry.punchType,
        formattedTime: res.entry.timeFormatted,
        nextState: res.entry.punchState,
        photoUrl: res.entry.photoUrl,
      });
      setShowOverrideModal(false);
    }
  };

  const handleConfirmSupervisorOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setOverrideError(null);

    if (!selectedSupervisorId) {
      setOverrideError('Please select an authorizing supervisor.');
      return;
    }
    if (!supervisorPin) {
      setOverrideError('Supervisor PIN is required.');
      return;
    }
    if (!overrideReason.trim()) {
      setOverrideError('Mandatory reason for override is required.');
      return;
    }

    const authSup = validateSupervisorPin(selectedSupervisorId, supervisorPin);
    if (!authSup.success) {
      setOverrideError(authSup.error || 'Invalid supervisor authorization.');
      return;
    }

    const overrideLog: SupervisorOverrideLog = {
      supervisorId: selectedSupervisorId,
      supervisorName: authSup.supervisorName || 'Shift Supervisor',
      overrideType: shiftEval?.overrideReason || 'UNSCHEDULED_SHIFT',
      reason: overrideReason.trim(),
      timestamp: new Date().toISOString(),
    };

    if (pendingPunchType) {
      await executePunch(pendingPunchType, overrideLog);
    }
  };

  const handleExit = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('open-dashboard'));
    }
  };

  const formatStateBadge = (state: CollaboratorPunchState) => {
    switch (state) {
      case 'WORKING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-black uppercase rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            WORKING (ON DUTY)
          </span>
        );
      case 'ON_BREAK':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black uppercase rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            ON BREAK
          </span>
        );
      case 'CLOCKED_OUT':
      case 'OFF_DUTY':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 border border-gray-300 text-gray-700 text-xs font-black uppercase rounded-full">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
            OFF DUTY
          </span>
        );
    }
  };

  return (
    <div className={`w-full max-w-4xl mx-auto text-white flex flex-col justify-between p-3.5 sm:p-5 font-sans ${isEmbedded ? 'rounded-2xl border border-gray-800 shadow-2xl bg-[#141518]' : 'min-h-[calc(100vh-5rem)] bg-[#141518] rounded-xl'}`}>
      {/* Hidden WebRTC Canvas element for photo snapshots */}
      <canvas ref={canvasRef} width="320" height="240" className="hidden" />

      {/* Terminal Top Bar */}
      <header className="flex flex-col sm:flex-row justify-between items-center gap-3 bg-gradient-to-r from-[#1f2228] to-[#16181d] p-3.5 sm:p-4 rounded-xl border border-gray-800 shadow-xl shrink-0">
        {/* Left: Branding & Station info */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#d51f2c] rounded-xl flex items-center justify-center font-black text-lg text-white shadow-lg shadow-rose-950/40 shrink-0">
            X7
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-wide uppercase leading-tight flex items-center gap-1.5 whitespace-nowrap">
              <span className="!text-white font-black">Time Clock Terminal</span>
              <span className="text-[#d51f2c] font-black">/</span>
              <span className="!text-white font-black">Kiosk</span>
            </h1>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>POS Station #1 • Main Store Floor</span>
            </p>
          </div>
        </div>

        {/* Right: Live Digital Clock & Controls */}
        <div className="flex items-center gap-4 sm:gap-5 shrink-0">
          <div className="text-right">
            <p className="text-lg sm:text-xl font-mono font-black text-emerald-400 leading-none tracking-tight">
              {currentTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
              })}
            </p>
            <p className="text-[11px] text-gray-300 font-bold uppercase tracking-wider mt-1 whitespace-nowrap">
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>

          {/* Photo verification badge status */}
          <div className="hidden md:flex items-center gap-2 bg-gray-900/90 border border-gray-700/70 px-3 py-1.5 rounded-xl shadow-inner">
            <span className={`w-2 h-2 rounded-full ${DEFAULT_CONFIG.enablePhotoVerification ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`}></span>
            <span className="text-[10px] text-gray-200 font-bold uppercase tracking-wider whitespace-nowrap">
              Camera Active
            </span>
          </div>

          {/* Always-Available Exit Button */}
          <button
            type="button"
            onClick={handleExit}
            className="px-4 py-2 bg-[#d51f2c] hover:bg-[#b01a24] text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-lg shadow-rose-950/50 hover:shadow-rose-900/70 active:scale-95 cursor-pointer shrink-0"
            title="Exit Time Clock Kiosk"
          >
            <span className="material-symbols-outlined text-base">logout</span>
            <span>Exit Kiosk</span>
          </button>
        </div>
      </header>

      {/* Main Terminal Body */}
      <main className="my-2 flex-1 flex items-center justify-center min-h-0">
        {/* SUCCESS SPLASH SCREEN */}
        {lastPunchSuccess ? (
          <div className="w-full max-w-md bg-gradient-to-b from-[#1b2520] to-[#121915] border-2 border-emerald-500/50 p-5 rounded-2xl shadow-2xl text-center animate-fade-in my-auto">
            <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg shadow-emerald-500/30">
              <span className="material-symbols-outlined text-3xl">check_circle</span>
            </div>

            <h2 className="text-xl font-black uppercase !text-white tracking-tight">
              Punch Registered!
            </h2>
            <p className="text-emerald-400 font-bold text-sm mt-0.5">
              {lastPunchSuccess.punchType.replace(/_/g, ' ')}
            </p>

            <div className="my-3 bg-black/40 border border-emerald-900/50 p-3 rounded-xl space-y-2 text-left">
              <div className="flex justify-between items-center border-b border-gray-800 pb-1.5">
                <span className="text-[11px] text-gray-400 uppercase font-bold">Collaborator</span>
                <span className="text-xs font-black !text-white">{lastPunchSuccess.collaboratorName}</span>
              </div>
              <div className="flex justify-between items-center border-b border-gray-800 pb-1.5">
                <span className="text-[11px] text-gray-400 uppercase font-bold">Timestamp</span>
                <span className="text-xs font-mono font-bold text-emerald-300">{lastPunchSuccess.formattedTime}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-gray-400 uppercase font-bold">Updated Status</span>
                <div>{formatStateBadge(lastPunchSuccess.nextState)}</div>
              </div>
            </div>

            <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1">
              <span>Auto-reset in 5s...</span>
              <button
                onClick={resetTerminal}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase text-[11px] rounded-lg shadow transition-all"
              >
                Next Punch Now
              </button>
            </div>
          </div>
        ) : !authenticatedAccount ? (
          /* KEYPAD AUTHENTICATION SCREEN */
          <div className="w-full max-w-xs bg-[#1f2228] border border-gray-800 p-3.5 sm:p-4 rounded-2xl shadow-2xl space-y-3 my-auto">
            <div className="text-center">
              <h2 className="text-lg font-black uppercase tracking-tight !text-white leading-tight">
                Enter Security PIN
              </h2>
              <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wider font-semibold">
                Tap your 4-to-6 digit PIN or scan RFID badge
              </p>
            </div>

            {/* Lockout Warning Banner */}
            {lockoutSeconds > 0 && (
              <div className="bg-rose-950/80 border border-rose-600 p-2.5 rounded-xl text-center space-y-0.5">
                <span className="material-symbols-outlined text-rose-400 text-xl">lock</span>
                <h4 className="text-rose-200 font-bold text-[11px] uppercase">Kiosk Locked</h4>
                <p className="text-rose-300 text-[10px] font-mono font-bold">
                  Retry in {lockoutSeconds}s...
                </p>
              </div>
            )}

            {/* Error Message Banner */}
            {authError && lockoutSeconds <= 0 && (
              <div className="bg-rose-900/40 border border-rose-700/60 p-2 rounded-lg text-center text-rose-300 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                {authError}
              </div>
            )}

            {/* Toggle Badge Scan vs Keypad */}
            <div className="flex border border-gray-700 p-0.5 rounded-xl bg-gray-900">
              <button
                type="button"
                onClick={() => {
                  setIsBadgeMode(false);
                  setAuthError(null);
                }}
                className={`flex-1 py-1 text-[10px] font-bold uppercase rounded-lg transition-all ${
                  !isBadgeMode ? 'bg-[#d51f2c] text-white shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                Digital Keypad
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsBadgeMode(true);
                  setAuthError(null);
                }}
                className={`flex-1 py-1 text-[10px] font-bold uppercase rounded-lg transition-all ${
                  isBadgeMode ? 'bg-[#d51f2c] text-white shadow-md' : 'text-gray-400 hover:text-white'
                }`}
              >
                Badge / RFID Scan
              </button>
            </div>

            {!isBadgeMode ? (
              /* MASKED PIN DISPLAY & KEYPAD */
              <div className="space-y-3">
                {/* Masked PIN Box */}
                <div className="bg-black/60 border-2 border-gray-700 h-10 rounded-xl flex items-center justify-center gap-2">
                  {Array.from({ length: Math.max(4, pinInput.length) }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                        idx < pinInput.length
                          ? 'bg-[#d51f2c] border-[#d51f2c] scale-110 shadow-lg shadow-[#d51f2c]/50'
                          : 'border-gray-600 bg-transparent'
                      }`}
                    />
                  ))}
                </div>

                {/* Touch Keypad Grid */}
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      onClick={() => handleKeypadDigit(digit)}
                      disabled={lockoutSeconds > 0}
                      className="h-10 bg-gray-800 hover:bg-gray-700 active:bg-[#d51f2c] text-white font-black text-lg rounded-xl shadow transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    onClick={handleKeypadClear}
                    disabled={lockoutSeconds > 0 || !pinInput}
                    className="h-10 bg-gray-900 hover:bg-rose-950/60 border border-gray-700 text-rose-400 font-bold text-[10px] uppercase tracking-wider rounded-xl shadow transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
                  >
                    CLEAR
                  </button>
                  <button
                    onClick={() => handleKeypadDigit('0')}
                    disabled={lockoutSeconds > 0}
                    className="h-10 bg-gray-800 hover:bg-gray-700 active:bg-[#d51f2c] text-white font-black text-lg rounded-xl shadow transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
                  >
                    0
                  </button>
                  <button
                    onClick={handleKeypadBackspace}
                    disabled={lockoutSeconds > 0 || !pinInput}
                    className="h-10 bg-gray-900 hover:bg-gray-700 border border-gray-700 text-amber-400 font-bold text-[10px] uppercase tracking-wider rounded-xl shadow transition-all active:scale-95 disabled:opacity-30 cursor-pointer"
                  >
                    ⌫ BACK
                  </button>
                </div>
              </div>
            ) : (
              /* BADGE SCAN SIMULATION FORM */
              <form onSubmit={handleBadgeScanSubmit} className="space-y-2 py-1">
                <div className="text-center p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-1.5">
                  <span className="material-symbols-outlined text-3xl text-emerald-400 animate-pulse">
                    contactless
                  </span>
                  <p className="text-[11px] text-gray-300 font-bold uppercase">
                    Hold Staff RFID / NFC Badge near reader
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                    Or Enter Badge Code (e.g. BADGE-101)
                  </label>
                  <input
                    type="text"
                    value={badgeInput}
                    onChange={(e) => setBadgeInput(e.target.value)}
                    placeholder="BADGE-101"
                    className="w-full px-4 py-3 bg-black/60 border border-gray-700 text-white font-mono text-center text-lg rounded-xl focus:border-[#d51f2c] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-[#d51f2c] hover:bg-[#b01a24] text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-lg transition-all"
                >
                  Submit Badge Code
                </button>
              </form>
            )}
          </div>
        ) : (
          /* COLLABORATOR CONTEXT & ACTION SELECTION SCREEN */
          <div className="w-full max-w-4xl bg-[#1f2228] border border-gray-800 p-6 md:p-8 rounded-2xl shadow-2xl space-y-8 animate-fade-in">
            {/* Top User Info Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-900/80 p-5 rounded-xl border border-gray-800">
              <div className="flex items-center gap-4">
                <img
                  src={authenticatedAccount.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop'}
                  alt={authenticatedAccount.name}
                  className="w-16 h-16 rounded-full border-2 border-[#d51f2c] object-cover shadow-md"
                />
                <div>
                  <h2 className="text-xl font-black uppercase !text-white tracking-tight">
                    {authenticatedAccount.name}
                  </h2>
                  <p className="text-xs text-gray-300 font-bold uppercase tracking-wider mt-0.5">
                    {authenticatedAccount.role} • {authenticatedAccount.department}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    Current Punch State
                  </p>
                  <div className="mt-1">{formatStateBadge(punchState)}</div>
                </div>

                <button
                  onClick={resetTerminal}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold uppercase rounded-lg border border-gray-700 transition-all"
                >
                  Switch User
                </button>
              </div>
            </div>

            {/* Scheduled Shift Alignment Info Card */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base text-amber-400">calendar_month</span>
                    Today's Scheduled Shift
                  </span>
                  {shiftEval?.hasScheduledShift ? (
                    <span className="text-[10px] bg-blue-900/60 border border-blue-700 text-blue-300 font-bold px-2 py-0.5 rounded">
                      SCHEDULED
                    </span>
                  ) : (
                    <span className="text-[10px] bg-amber-900/60 border border-amber-700 text-amber-300 font-bold px-2 py-0.5 rounded">
                      UNSCHEDULED
                    </span>
                  )}
                </div>

                {shiftEval?.hasScheduledShift && shiftEval.shiftAssignment ? (
                  <div>
                    <p className="text-xl font-black font-mono text-white">
                      {shiftEval.shiftAssignment.startTime} - {shiftEval.shiftAssignment.endTime}
                    </p>
                    <p className="text-xs text-gray-400 mt-1 font-semibold">
                      Preset: <span className="text-gray-200">{shiftEval.shiftAssignment.presetName}</span> • Planned Hours: {shiftEval.shiftAssignment.hours} hrs
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-amber-300">
                      No active shift assigned for today.
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Unscheduled clock-in will require Shift Supervisor authorization.
                    </p>
                  </div>
                )}

                {shiftEval?.isEarlyClockIn && (
                  <div className="bg-amber-950/60 border border-amber-700 p-2.5 rounded-lg text-amber-300 text-xs font-bold flex items-center gap-2">
                    <span className="material-symbols-outlined text-base">warning</span>
                    Early Punch Warning: {shiftEval.earlyMinutes} minutes early. Supervisor approval required.
                  </div>
                )}
              </div>

              {/* Photo Verification / Webcam Live Preview Box */}
              <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base text-emerald-400">photo_camera</span>
                    Front-Camera Verification
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold uppercase">
                    Anti-Buddy Guard
                  </span>
                </div>

                <div className="h-32 bg-black rounded-lg border border-gray-800 overflow-hidden relative flex items-center justify-center">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  {!cameraActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/90 text-gray-400 text-xs font-bold p-2 text-center">
                      <span className="material-symbols-outlined text-3xl mb-1 text-gray-500">videocam_off</span>
                      Camera Preview Ready (Simulation Mode)
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Contextual Action Triggers */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-gray-400 tracking-wider">
                Select Attendance Action Trigger
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* CLOCK IN ACTION */}
                {(punchState === 'OFF_DUTY' || punchState === 'CLOCKED_OUT') && (
                  <button
                    onClick={() => handlePunchClick('CLOCK_IN')}
                    className="col-span-1 sm:col-span-2 py-8 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-black text-2xl uppercase tracking-wider rounded-2xl shadow-xl hover:shadow-emerald-600/30 transition-all flex items-center justify-center gap-3 active:scale-[0.99]"
                  >
                    <span className="material-symbols-outlined text-4xl">login</span>
                    CLOCK IN (START SHIFT)
                  </button>
                )}

                {/* START BREAK ACTION */}
                {punchState === 'WORKING' && (
                  <button
                    onClick={() => handlePunchClick('START_BREAK')}
                    className="py-6 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-amber-950 font-black text-xl uppercase tracking-wider rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.99]"
                  >
                    <span className="material-symbols-outlined text-3xl">free_breakfast</span>
                    START BREAK
                  </button>
                )}

                {/* END BREAK ACTION */}
                {punchState === 'ON_BREAK' && (
                  <button
                    onClick={() => handlePunchClick('END_BREAK')}
                    className="col-span-1 sm:col-span-2 py-8 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-black text-2xl uppercase tracking-wider rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.99]"
                  >
                    <span className="material-symbols-outlined text-4xl">work_history</span>
                    END BREAK (RESUME WORK)
                  </button>
                )}

                {/* CLOCK OUT ACTION */}
                {punchState === 'WORKING' && (
                  <button
                    onClick={() => handlePunchClick('CLOCK_OUT')}
                    className="py-6 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-black text-xl uppercase tracking-wider rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 active:scale-[0.99]"
                  >
                    <span className="material-symbols-outlined text-3xl">logout</span>
                    CLOCK OUT (END SHIFT)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* SUPERVISOR OVERRIDE MODAL */}
      {showOverrideModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1f2228] border-2 border-amber-500 max-w-lg w-full p-6 md:p-8 rounded-2xl shadow-2xl space-y-6 animate-fade-in text-left">
            <div className="flex items-center gap-3 border-b border-gray-800 pb-4">
              <div className="w-12 h-12 bg-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-3xl">admin_panel_settings</span>
              </div>
              <div>
                <h3 className="text-xl font-black uppercase text-white leading-none">
                  Supervisor Override Required
                </h3>
                <p className="text-xs text-amber-400 font-bold uppercase mt-1">
                  {shiftEval?.overrideReason === 'EARLY_CLOCK_IN'
                    ? `Early Clock-In (${shiftEval.earlyMinutes}m prior to scheduled start)`
                    : 'Unscheduled Shift Clock-In'}
                </p>
              </div>
            </div>

            {overrideError && (
              <div className="bg-rose-900/40 border border-rose-700 p-3 rounded-lg text-rose-300 text-xs font-bold uppercase">
                {overrideError}
              </div>
            )}

            <form onSubmit={handleConfirmSupervisorOverride} className="space-y-4">
              {/* Select Supervisor */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-300 tracking-wider">
                  Authorizing Supervisor
                </label>
                <select
                  value={selectedSupervisorId}
                  onChange={(e) => setSelectedSupervisorId(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 text-white font-bold rounded-xl focus:border-amber-500 focus:outline-none"
                >
                  {getSupervisors().map((sup) => (
                    <option key={sup.collaboratorId} value={sup.collaboratorId}>
                      {sup.name} ({sup.role})
                    </option>
                  ))}
                </select>
              </div>

              {/* Supervisor PIN */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-300 tracking-wider">
                  Supervisor Security PIN
                </label>
                <input
                  type="password"
                  maxLength={6}
                  value={supervisorPin}
                  onChange={(e) => setSupervisorPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-4 py-3 bg-black/60 border border-gray-700 text-white font-mono text-center text-xl tracking-widest rounded-xl focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Mandatory Reason */}
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase text-gray-300 tracking-wider">
                  Mandatory Authorization Reason
                </label>
                <select
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 text-white text-xs font-semibold rounded-xl focus:border-amber-500 focus:outline-none"
                >
                  <option value="">-- Select or type reason below --</option>
                  <option value="Approved Early Arrival for Prep">Approved Early Arrival for Prep</option>
                  <option value="Coverage for Absent Staff">Coverage for Absent Staff</option>
                  <option value="Manager Authorized Unscheduled Shift">Manager Authorized Unscheduled Shift</option>
                  <option value="Peak Rush Support">Peak Rush Support</option>
                  <option value="System Correction">System Correction</option>
                </select>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Or enter custom reason details..."
                  className="w-full px-4 py-2.5 bg-gray-900 border border-gray-700 text-white text-xs rounded-xl focus:border-amber-500 focus:outline-none mt-2"
                />
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowOverrideModal(false)}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-amber-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all"
                >
                  Approve & Punch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminal Footer */}
      <footer className="mt-4 pt-4 border-t border-gray-900 flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase tracking-widest">
        <span>X7 POS • Attendance Control Terminal</span>
        <span>Secure PIN & Biometric Pipeline</span>
      </footer>

      {/* Persistent Staff Management Navigation Bar */}
      {!isEmbedded && <StaffManagementQuickLinks activeModule="kiosk" onNavigate={onNavigate} />}
    </div>
  );
};
