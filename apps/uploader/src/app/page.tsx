import type { Metadata } from "next";
import { AppShot } from "@/landing/app-shot";
import { ConsoleComparison } from "@/landing/console-comparison";
import { FeatureCards } from "@/landing/feature-cards";
import { Hero } from "@/landing/hero";
import { LandingFooter } from "@/landing/landing-footer";
import { LandingNav } from "@/landing/landing-nav";
import { TraceTile } from "@/landing/trace-tile";
import "@/styles/landing.css";

export const metadata: Metadata = {
	title: { absolute: "Morse Uploader, a transfer client for Walrus" },
	description:
		"Move data to Walrus and keep every key. A non-custodial transfer client in the browser: your wallet is the login and signs every transaction.",
};

/** The landing (design/v2/index.html): static, no client code of its own. */
export default function HomePage() {
	return (
		<>
			<div className="glow accent" aria-hidden="true" />
			<div className="glow deep" aria-hidden="true" />
			<div className="land">
				<TraceTile side="left" />
				<TraceTile side="right" />
				<LandingNav />
				<main>
					<Hero />
					<AppShot />
					<FeatureCards />
					<ConsoleComparison />
				</main>
				<LandingFooter />
			</div>
		</>
	);
}
