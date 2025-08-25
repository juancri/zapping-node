import { spawn, ChildProcess } from 'child_process';
import { ApiService } from './api';
import { Channel } from '../types';
import { USER_AGENT } from '../constants';
import { Logger } from './logger';

export class PlayerService {
	private apiService: ApiService;
	private mpvProcess: ChildProcess | null = null;
	private heartbeatInterval: NodeJS.Timeout | null = null;
	private playToken: string | null = null;

	constructor() {
		this.apiService = new ApiService();
		this.setupGracefulShutdown();
	}

	async playChannel(channel: Channel, token: string): Promise<void> {
		try {
			Logger.info(
				'PLAYER',
				`Starting playback for channel ${channel.number}: ${channel.name}`
			);

			// Get play token from DrHouse
			Logger.info('PLAYER', 'Getting play token...');
			this.playToken = await this.apiService.getDrHousePlayToken(token);

			// Construct stream URL
			const streamUrl = `${channel.url}?token=${this.playToken}`;

			// Start heartbeat to maintain session
			this.startHeartbeat();

			// Start mpv player and wait for it to complete
			Logger.info('PLAYER', 'Starting mpv player...');
			await this.startMpvPlayer(streamUrl);
		} catch (error) {
			Logger.error('PLAYER', 'Failed to start playback:', error);
			this.cleanup();
			throw error;
		}
	}

	async playChannelAtTime(
		channel: Channel,
		token: string,
		startTime: number,
		endTime?: number
	): Promise<void> {
		try {
			Logger.info(
				'PLAYER',
				`Starting time-based playback for channel ${channel.number}: ${channel.name} at timestamp ${startTime}`
			);

			// Get play token from DrHouse
			Logger.info('PLAYER', 'Getting play token...');
			this.playToken = await this.apiService.getDrHousePlayToken(token);

			// Construct stream URL with time parameters
			let streamUrl = `${channel.url}?token=${this.playToken}&startTime=${startTime}`;
			if (endTime) {
				streamUrl += `&endTime=${endTime}`;
			}

			Logger.info('PLAYER', `Stream URL: ${streamUrl}`);

			// Start heartbeat to maintain session
			this.startHeartbeat();

			// Start mpv player and wait for it to complete
			Logger.info('PLAYER', 'Starting mpv player...');
			await this.startMpvPlayer(streamUrl);
		} catch (error) {
			Logger.error('PLAYER', 'Failed to start time-based playback:', error);
			this.cleanup();
			throw error;
		}
	}

	private startMpvPlayer(streamUrl: string): Promise<void> {
		return new Promise((resolve, reject) => {
			// MPV arguments based on the bash script
			const mpvArgs = [
				`--user-agent=${USER_AGENT}`,
				'--demuxer-lavf-o=live_start_index=-99999',
				'--force-seekable=yes',
				streamUrl,
			];

			// Spawn mpv process
			this.mpvProcess = spawn('mpv', mpvArgs, {
				stdio: 'inherit', // Pass through stdin, stdout, stderr
			});

			// Handle mpv process events
			this.mpvProcess.on('close', (code) => {
				Logger.info('PLAYER', `Playback ended (exit code: ${code})`);
				this.cleanup();
				resolve();
			});

			this.mpvProcess.on('error', (error) => {
				Logger.error('PLAYER', 'MPV error:', error);
				this.cleanup();
				reject(error);
			});
		});
	}

	private startHeartbeat(): void {
		if (!this.playToken) return;

		// Send initial heartbeat immediately
		this.sendHeartbeat();

		// Then send heartbeat every 25 seconds (as in bash script)
		this.heartbeatInterval = setInterval(() => {
			this.sendHeartbeat();
		}, 25000);
	}

	private async sendHeartbeat(): Promise<void> {
		if (!this.playToken) return;

		try {
			Logger.debug('PLAYER', 'Pinging DrHouse...');
			await this.apiService.sendHeartbeat(this.playToken);
		} catch (error) {
			Logger.error('PLAYER', 'Heartbeat failed:', error);
		}
	}

	private cleanup(): void {
		// Stop heartbeat
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}

		// Kill mpv process if still running
		if (this.mpvProcess && !this.mpvProcess.killed) {
			this.mpvProcess.kill();
			this.mpvProcess = null;
		}

		this.playToken = null;
	}

	private setupGracefulShutdown(): void {
		// Handle various exit signals
		const exitSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT'] as const;

		exitSignals.forEach((signal) => {
			process.on(signal, () => {
				Logger.info('PLAYER', `Received ${signal}, cleaning up...`);
				this.cleanup();
				process.exit(0);
			});
		});

		// Handle uncaught exceptions
		process.on('uncaughtException', (error) => {
			Logger.error('PLAYER', 'Uncaught exception:', error);
			this.cleanup();
			process.exit(1);
		});

		process.on('unhandledRejection', (reason) => {
			Logger.error('PLAYER', 'Unhandled rejection:', reason);
			this.cleanup();
			process.exit(1);
		});
	}

	// Check if mpv is available
	static async checkMpvAvailable(): Promise<boolean> {
		return new Promise((resolve) => {
			const mpvCheck = spawn('mpv', ['--version'], { stdio: 'pipe' });
			mpvCheck.on('close', (code) => {
				resolve(code === 0);
			});
			mpvCheck.on('error', () => {
				resolve(false);
			});
		});
	}
}
