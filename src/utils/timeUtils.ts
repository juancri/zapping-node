import * as chrono from 'chrono-node';

export interface ParsedTime {
	timestamp: number;
	description: string;
	date: Date;
}

export class TimeParser {
	public static parseTimeExpression(expression: string): ParsedTime | null {
		const trimmed = expression.trim();

		if (!trimmed) {
			return null;
		}

		// Use chrono to parse the natural language date/time expression
		const results = chrono.parse(trimmed);

		if (results.length === 0) {
			return null;
		}

		// Take the first (best) result
		const result = results[0];
		if (!result) {
			return null;
		}
		const parsedDate = result.date();

		// Validate that the parsed date is in the past (for watching previous content)
		const now = new Date();
		if (parsedDate > now) {
			// If the parsed date is in the future, it might be an ambiguous expression
			// Try to interpret it as a time in the past
			const dayBefore = new Date(parsedDate);
			dayBefore.setDate(dayBefore.getDate() - 1);

			if (dayBefore <= now) {
				const timestamp = Math.floor(dayBefore.getTime() / 1000);
				const description = this.generateDescription(expression, dayBefore);
				return { timestamp, description, date: dayBefore };
			}

			// Still in the future, return null as this doesn't make sense for catchup
			return null;
		}

		const timestamp = Math.floor(parsedDate.getTime() / 1000);
		const description = this.generateDescription(expression, parsedDate);

		return { timestamp, description, date: parsedDate };
	}

	private static generateDescription(originalExpression: string, parsedDate: Date): string {
		const now = new Date();
		const diffMs = now.getTime() - parsedDate.getTime();
		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMinutes / 60);
		const diffDays = Math.floor(diffHours / 24);

		// Generate a descriptive string based on the time difference
		if (diffMinutes < 60) {
			return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
		} else if (diffHours < 24) {
			return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
		} else if (diffDays < 7) {
			if (diffDays === 1) {
				return `yesterday at ${this.formatTime(parsedDate)}`;
			}
			return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago at ${this.formatTime(parsedDate)}`;
		} else {
			// For longer periods, use the original expression or format the date
			return `${originalExpression} (${this.formatDate(parsedDate)})`;
		}
	}

	private static formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
		});
	}

	private static formatDate(date: Date): string {
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
			hour12: true,
		});
	}

	public static validateTimeExpression(expression: string): boolean {
		return this.parseTimeExpression(expression) !== null;
	}

	public static getCurrentTimestamp(): number {
		return Math.floor(Date.now() / 1000);
	}

	public static formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp * 1000);
		return date.toLocaleString();
	}

	// Helper method to get examples of supported time expressions
	public static getExamples(): string[] {
		return [
			'2 hours ago',
			'30 minutes ago',
			'1 day ago',
			'yesterday at 3pm',
			'yesterday 15:30',
			'last friday at 9am',
			'tuesday at noon',
			'3 days ago at 2pm',
			'this morning at 8am',
			'last night at 10pm',
		];
	}
}
