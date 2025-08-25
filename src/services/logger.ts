import * as fs from 'fs';

const LOG_FILE = '/tmp/zapping-node.log';

export class Logger {
	private static formatTimestamp(): string {
		return new Date().toISOString();
	}

	private static writeToFile(level: string, tag: string, message: string, data?: any): void {
		const timestamp = this.formatTimestamp();
		let logLine = `[${timestamp}] ${level.toUpperCase()} [${tag}] ${message}`;

		if (data !== undefined) {
			if (typeof data === 'object') {
				logLine += '\n' + JSON.stringify(data, null, 2);
			} else {
				logLine += ` ${data}`;
			}
		}

		logLine += '\n';

		try {
			fs.appendFileSync(LOG_FILE, logLine, 'utf-8');
		} catch (error) {
			// Fallback to console if file write fails
			console.error('Failed to write to log file:', error);
			console.log(logLine);
		}
	}

	static info(tag: string, message: string, data?: any): void {
		this.writeToFile('info', tag, message, data);
	}

	static error(tag: string, message: string, data?: any): void {
		this.writeToFile('error', tag, message, data);
	}

	static warn(tag: string, message: string, data?: any): void {
		this.writeToFile('warn', tag, message, data);
	}

	static debug(tag: string, message: string, data?: any): void {
		this.writeToFile('debug', tag, message, data);
	}

	static getLogFilePath(): string {
		return LOG_FILE;
	}

	static clearLog(): void {
		try {
			fs.writeFileSync(LOG_FILE, '', 'utf-8');
		} catch (error) {
			// Ignore errors when clearing log
		}
	}
}
