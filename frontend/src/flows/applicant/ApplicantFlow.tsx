import type { Account } from "../../api/types";
import { AuthForm } from "../../components/AuthForm";
import { Stepper } from "../../components/Stepper";
import { MembershipStep } from "./MembershipStep";
import { ProfileStep } from "./ProfileStep";

interface Props {
  account: Account | null;
  onAccountChange: (a: Account | null) => void;
}

const STEPS = ["Your account", "Membership", "Your profile"];

/**
 * Applicant journey: sign in / create account → pay for membership → edit profile.
 * The step is derived from the account, so returning members land straight on their profile.
 */
export function ApplicantFlow({ account, onAccountChange }: Props) {
  const isApplicant = account?.role === "applicant";
  const step = !isApplicant ? 0 : !account.isMember ? 1 : 2;

  return (
    <div className="flow">
      <Stepper steps={STEPS} current={step} />

      <div className="flow-body" key={step}>
        {step === 0 && (
          <div className="card card-narrow">
            {account?.role === "employer" && (
              <p className="notice">
                You're signed in as an employer. Create or sign in to an applicant account to continue.
              </p>
            )}
            <AuthForm
              role="applicant"
              title="Get started"
              subtitle="A few basics, then you'll choose a membership."
              onDone={onAccountChange}
            />
          </div>
        )}
        {step === 1 && account && <MembershipStep onPaid={onAccountChange} />}
        {step === 2 && account && <ProfileStep account={account} />}
      </div>
    </div>
  );
}
