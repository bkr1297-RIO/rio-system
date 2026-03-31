/**
 * InstallPrompt — "Add to Home Screen" Banner
 *
 * Shows a native-feeling install banner at the bottom of the screen:
 * - Android/Chrome: triggers the native install dialog
 * - iOS: shows manual instructions (Share → Add to Home Screen)
 * - Already installed: hidden
 */
import { useState } from "react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { X, Download, Share } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InstallPrompt() {
  const { canInstall, isIOS, isStandalone, promptInstall, dismissed } =
    useInstallPrompt();
  const [localDismissed, setLocalDismissed] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // Don't show if already installed or user dismissed
  if (isStandalone || dismissed || localDismissed) return null;

  // Don't show if neither Android install nor iOS
  if (!canInstall && !isIOS) return null;

  return (
    <>
      {/* Main install banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom">
        <div className="mx-2 mb-2 rounded-2xl border border-rio-gold/30 bg-rio-navy/95 backdrop-blur-lg shadow-2xl shadow-black/50 p-4">
          <div className="flex items-start gap-3">
            {/* App icon */}
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663422505268/UX2SXDqogojKE7g6Yj8W26/icon-96x96_0fbc2ebd.png"
              alt="RIO"
              className="w-12 h-12 rounded-xl shrink-0"
            />

            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white">
                Install RIO
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Add to your home screen for quick access to approvals, receipts,
                and your governance ledger.
              </p>
            </div>

            {/* Dismiss */}
            <button
              onClick={() => setLocalDismissed(true)}
              className="text-gray-500 hover:text-gray-300 p-1 shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            {canInstall ? (
              <Button
                onClick={promptInstall}
                className="flex-1 bg-rio-gold text-rio-navy font-semibold hover:bg-rio-gold/90"
                size="sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Install App
              </Button>
            ) : isIOS ? (
              <Button
                onClick={() => setShowIOSGuide(true)}
                className="flex-1 bg-rio-gold text-rio-navy font-semibold hover:bg-rio-gold/90"
                size="sm"
              >
                <Share className="w-4 h-4 mr-2" />
                Add to Home Screen
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* iOS instruction overlay */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end justify-center">
          <div className="w-full max-w-md mx-2 mb-2 rounded-2xl bg-rio-navy border border-rio-gold/30 p-6 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">
                Install RIO on iOS
              </h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="text-gray-500 hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <Step
                number={1}
                text={
                  <>
                    Tap the <Share className="w-4 h-4 inline mx-1" />{" "}
                    <strong>Share</strong> button in Safari
                  </>
                }
              />
              <Step
                number={2}
                text={
                  <>
                    Scroll down and tap{" "}
                    <strong>Add to Home Screen</strong>
                  </>
                }
              />
              <Step
                number={3}
                text={
                  <>
                    Tap <strong>Add</strong> in the top right
                  </>
                }
              />
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              RIO will appear on your home screen as a standalone app.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

function Step({
  number,
  text,
}: {
  number: number;
  text: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-6 h-6 rounded-full bg-rio-gold/20 text-rio-gold text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {number}
      </span>
      <p className="text-sm text-gray-300">{text}</p>
    </div>
  );
}
