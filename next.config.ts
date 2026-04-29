import type { NextConfig } from "next";
import { withAxiom } from "next-axiom";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default withAxiom(nextConfig);
