import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function ToggleDemo() {
	const [enabled, setEnabled] = useState(false);

	const cards = [
		{
			id: 1,
			type: "noise",
			author: "Viral Growth Ninja",
			handle: "@growth_hacker",
			time: "3h • Manufactured drama",
			text: "I fired my top employee today. Here's why that's actually inspiring...",
		},
		{
			id: 2,
			type: "signal",
			author: "Postgres Engineering",
			handle: "@postgres",
			time: "2h • v17 Release",
			text: "Just pushed the new vector search update. It simplifies the entire stack. Benchmarks attached.",
		},
		{
			id: 3,
			type: "noise",
			author: "Tech Futurist 🚀",
			handle: "@ai_prophet",
			time: "1h • Engagement farming",
			text: "Stop learning to code. The new AI update just made junior devs obsolete. If you aren't pivoting, you're done.",
		},
		{
			id: 4,
			type: "noise",
			author: "Grindset Guru",
			handle: "@hustle_hard",
			time: "5h • Empty outrage loop",
			text: "Unpopular opinion: If you sleep more than 4 hours, you're poor. #hustle #mindset",
		},
		{
			id: 5,
			type: "noise",
			author: "Career Coach",
			handle: "@link_in_bio",
			time: "Just now • Clickbait",
			text: "I'm shaking right now. I can't believe I'm sharing this personal news...",
		},
	];

	return (
		<div className="w-full max-w-2xl mx-auto">
			{/* The Toggle Switch */}
			<div className="mb-10 flex items-center justify-center gap-6">
				<span
					className={`font-mono text-xs uppercase tracking-widest transition-colors ${enabled ? "text-gray-300" : "text-gray-900"}`}
				>
					Noise
				</span>

				<button
					type="button"
					onClick={() => setEnabled(!enabled)}
					className={`relative h-8 w-14 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4A6C48] ${
						enabled ? "bg-[#1A1A1A]" : "bg-[#C15C5C]" // Red when Noise, Black when Signal
					}`}
				>
					<motion.div
						className="absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-sm"
						animate={{ x: enabled ? 24 : 0 }}
						transition={{ type: "spring", stiffness: 500, damping: 30 }}
					/>
				</button>

				<span
					className={`font-mono text-xs uppercase tracking-widest transition-colors ${enabled ? "text-[#4A6C48] font-bold" : "text-gray-400"}`}
				>
					Signal
				</span>
			</div>

			{/* The Feed Stack */}
			<div className="space-y-4 relative">
				<AnimatePresence initial={false}>
					{cards.map((card) => {
						const isNoise = card.type === "noise";
						const isHidden = enabled && isNoise;

						return (
							<motion.div
								key={card.id}
								layout
								initial={{ opacity: 0, y: 20 }}
								animate={{
									opacity: 1,
									y: 0,
									height: isHidden ? 4 : "auto",
									marginBottom: isHidden ? 8 : 16, // Tighter spacing when hidden
								}}
								transition={{
									type: "spring",
									stiffness: 400,
									damping: 30,
									opacity: { duration: 0.2 },
								}}
								className={`relative overflow-hidden rounded-xl border text-left transition-colors duration-500 ${
									isHidden
										? "border-transparent bg-gray-200/50" // Collapsed State (Neutral Gray)
										: isNoise
											? "border-[#C15C5C]/20 bg-[#f4eaea]" // Noise State (Muted Brick Tint)
											: "border-[#4A6C48]/30 bg-[#edf2ec] shadow-sm" // Signal State (Sage Green Tint)
								}`}
							>
								{/* Content Container - Fades out when hidden */}
								<motion.div
									animate={{ opacity: isHidden ? 0 : 1 }}
									className="p-5"
								>
									{/* Header: Avatar + Name + Meta */}
									<div className="flex items-center gap-3 mb-3">
										{/* Avatar Circle */}
										<div
											className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] ${
												card.type === "signal"
													? "bg-[#4A6C48]/20 text-[#4A6C48]"
													: "bg-[#C15C5C]/10 text-[#C15C5C]"
											}`}
										>
											{/* Abstract Avatar Icon */}
											<div
												className={`w-2 h-2 rounded-full ${card.type === "signal" ? "bg-[#4A6C48]" : "bg-[#C15C5C]"}`}
											/>
										</div>

										{/* Text Block */}
										<div className="flex flex-col justify-center leading-none">
											<div className="flex items-baseline gap-2">
												<span className="text-sm font-semibold text-[#1A1A1A] tracking-tight">
													{card.author}
												</span>
												<span className="text-xs text-gray-500 font-normal hidden sm:inline-block">
													{card.handle}
												</span>
											</div>
											<span className="text-[10px] font-mono text-gray-500 uppercase tracking-wide mt-1">
												{card.time}
											</span>
										</div>
									</div>

									{/* Post Body */}
									<p
										className={`font-serif text-lg leading-relaxed ${
											card.type === "signal"
												? "text-[#1A1A1A]"
												: "text-[#1A1A1A]/80 italic"
										}`}
									>
										{card.text}
									</p>

									{/* Label for Noise (Optional, adds clarity) */}
									{isNoise && !enabled && (
										<div className="mt-3 inline-block px-2 py-1 rounded bg-[#C15C5C]/10 border border-[#C15C5C]/20 text-[#C15C5C] font-mono text-[9px] uppercase tracking-widest">
											Detected: {card.time.split("•")[1]}
										</div>
									)}
								</motion.div>
							</motion.div>
						);
					})}
				</AnimatePresence>
			</div>

			{/* Caption */}
			<p className="mt-8 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400 opacity-60">
				Toggle to see what Unslop does to your feed.
			</p>
		</div>
	);
}
