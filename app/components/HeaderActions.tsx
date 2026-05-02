import Link from "next/link";
import { IntelSetupButton } from "./IntelSetupButton";

export function HeaderActions({ endpointUrl }: { endpointUrl: string }) {
  return (
    <>
      <Link href="/ops" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
        Recent Ops
      </Link>
      <IntelSetupButton endpointUrl={endpointUrl} />
    </>
  );
}
