import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_FILE } from '../constants';
import { Logger } from './logger';

export class ConfigService {
	static exists(): boolean {
		return fs.existsSync(CONFIG_FILE);
	}

	static loadToken(): string | null {
		if (!this.exists()) {
			return null;
		}

		try {
			return fs.readFileSync(CONFIG_FILE, 'utf-8').trim();
		} catch (error) {
			Logger.error('CONFIG', 'Error reading config file:', error);
			return null;
		}
	}

	static saveToken(token: string): void {
		const configDir = path.dirname(CONFIG_FILE);

		// Create config directory if it doesn't exist
		if (!fs.existsSync(configDir)) {
			fs.mkdirSync(configDir, { recursive: true });
		}

		fs.writeFileSync(CONFIG_FILE, token, 'utf-8');
	}
}
