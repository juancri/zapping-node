#!/usr/bin/env node

import * as blessed from 'blessed';
import { Command } from 'commander';
import { AuthService } from './services/auth';
import { ApiService } from './services/api';
import { ConfigService } from './services/config';
import { PlayerService } from './services/player';
import { Logger } from './services/logger';
import { Channel } from './types';
import { TimeParser } from './utils/timeUtils';

class ZappingUI {
	private screen: blessed.Widgets.Screen;
	private container: blessed.Widgets.BoxElement | null = null;
	private searchBox: blessed.Widgets.TextboxElement | null = null;
	private channelList: blessed.Widgets.ListElement | null = null;
	private instructionBox: blessed.Widgets.BoxElement | null = null; // Used for UI layout
	private authService: AuthService;
	private apiService: ApiService;
	private playerService: PlayerService;
	private token: string | null = null;
	private channels: Channel[] = [];
	private filteredChannels: Channel[] = [];

	constructor() {
		this.screen = blessed.screen({
			smartCSR: true,
			title: 'Zapping TV'
		});

		this.apiService = new ApiService();
		this.authService = new AuthService(this.apiService);
		this.playerService = new PlayerService();
		this.setupKeyBindings();
	}

	private setupKeyBindings(): void {
		this.screen.key(['C-c'], () => {
			this.quit();
		});

		this.screen.key(['escape'], () => {
			const currentSearch = this.searchBox?.getValue() || '';
			if (currentSearch) {
				this.clearSearch();
			} else {
				this.quit();
			}
		});

		// Handle direct typing for search
		this.screen.on('keypress', (ch: string, key: any) => {
			this.handleDirectTyping(ch, key);
		});
	}

	private handleDirectTyping(ch: string, key: any): void {
		// Ignore if search box doesn't exist yet
		if (!this.searchBox || !this.channelList) return;

		// Ignore special keys and navigation keys
		if (!ch || key.ctrl || key.meta || key.shift) return;
		if (['return', 'enter', 'escape', 'tab', 'up', 'down', 'left', 'right'].includes(key.name)) return;

		// Handle backspace
		if (key.name === 'backspace') {
			const currentValue = this.searchBox.getValue();
			if (currentValue) {
				const newValue = currentValue.slice(0, -1);
				this.searchBox.setValue(newValue);
				this.filterChannels(newValue);
				this.screen.render();
			}
			return;
		}

		// Handle printable characters (letters, numbers, space, etc.)
		if (ch && ch.length === 1 && ch.charCodeAt(0) >= 32) {
			const currentValue = this.searchBox.getValue() || '';
			const newValue = currentValue + ch;
			this.searchBox.setValue(newValue);
			this.filterChannels(newValue);
			this.screen.render();
		}
	}

	private createMainUI(): void {
		// Main container
		this.container = blessed.box({
			parent: this.screen,
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			border: {
				type: 'line'
			},
			style: {
				border: {
					fg: 'cyan'
				}
			},
			label: ' Zapping TV - Channel Browser ',
			tags: true
		});

		// Search box
		this.searchBox = blessed.textbox({
			parent: this.container,
			top: 1,
			left: 1,
			width: '100%-2',
			height: 3,
			border: {
				type: 'line'
			},
			style: {
				border: {
					fg: 'blue'
				},
				focus: {
					border: {
						fg: 'yellow'
					}
				}
			},
			label: ' Search (Type to filter, ESC to clear) ',
			inputOnFocus: true,
			tags: true
		});

		// Channel list
		this.channelList = blessed.list({
			parent: this.container,
			top: 4,
			left: 1,
			width: '100%-2',
			height: '100%-7',
			border: {
				type: 'line'
			},
			style: {
				border: {
					fg: 'green'
				},
				selected: {
					bg: 'blue',
					fg: 'white'
				},
				item: {
					hover: {
						bg: 'gray'
					}
				}
			},
			label: ' Channels (Use arrow keys to navigate, Enter to select) ',
			keys: true,
			mouse: true,
			vi: false,
			scrollable: true,
			alwaysScroll: true,
			tags: true
		});

		// Instructions
		this.instructionBox = blessed.box({
			parent: this.container,
			bottom: 0,
			left: 1,
			width: '100%-2',
			height: 2,
			content: '{center}{bold}Type to search • [↑↓] to navigate • [Enter] to select • [ESC] to clear/quit{/bold}{/center}',
			tags: true,
			style: {
				fg: 'cyan'
			}
		});

		// Make sure instructions are visible
		this.instructionBox.show();

		this.setupSearchHandlers();
		this.setupChannelListHandlers();
		this.screen.render();
	}

	private async loadChannels(): Promise<void> {
		if (!this.token || !this.channelList) return;

		try {
			// Show loading
			this.channelList.setLabel(' Loading channels... ');
			this.screen.render();

			// Get channel list
			const channelList = await this.apiService.getChannelList(this.token);
			
			// Convert object to array and sort channels by number
			this.channels = Object.values(channelList.data).sort((a, b) => a.number - b.number);
			this.filteredChannels = [...this.channels];
			
			// Update channel list
			this.updateChannelList();
			this.channelList.focus();
		} catch (error: any) {
			Logger.error('CHANNELS', 'Failed to load channels:', error);
			Logger.error('CHANNELS', 'Error details:', {
				message: error.message,
				stack: error.stack
			});
			this.channelList.setLabel(` Error loading channels: ${error.message || error} `);
			this.screen.render();
		}
	}

	private quit(): void {
		this.screen.destroy();
		process.exit(0);
	}

	private setupSearchHandlers(): void {
		if (!this.searchBox) return;

		// The search box is now just for visual display
		// All input is handled by the global keypress handler
	}

	private setupChannelListHandlers(): void {
		if (!this.channelList) return;

		this.channelList.on('select', (_item: blessed.Widgets.BlessedElement, index: number) => {
			const channel = this.filteredChannels[index];
			if (channel) {
				this.showPlaybackModeSelection(channel);
			}
		});
	}

	private filterChannels(searchTerm: string): void {
		const term = searchTerm.toLowerCase().trim();
		
		if (term === '') {
			this.filteredChannels = [...this.channels];
		} else {
			this.filteredChannels = this.channels.filter(channel => 
				channel.name.toLowerCase().includes(term) || 
				channel.number.toString().includes(term)
			);
		}
		
		this.updateChannelList();
	}

	private updateChannelList(): void {
		if (!this.channelList) return;

		const items = this.filteredChannels.map(channel => 
			`${channel.number.toString().padStart(3, ' ')} - ${channel.name}`
		);

		this.channelList.setItems(items);
		this.channelList.setLabel(` Channels (${this.filteredChannels.length}/${this.channels.length}) `);
		this.screen.render();
	}


	private clearSearch(): void {
		if (this.searchBox) {
			this.searchBox.clearValue();
			this.filterChannels('');
			this.channelList?.focus();
		}
	}

	private showPlaybackModeSelection(channel: Channel): void {
		const modeDialog = blessed.box({
			parent: this.screen,
			top: 'center',
			left: 'center',
			width: '60%',
			height: '50%',
			border: {
				type: 'line'
			},
			style: {
				border: {
					fg: 'yellow'
				}
			},
			label: ` ${channel.name} - Select Playback Mode `,
			tags: true
		});

		const modeList = blessed.list({
			parent: modeDialog,
			top: 1,
			left: 1,
			width: '100%-2',
			height: '100%-4',
			border: {
				type: 'line'
			},
			style: {
				border: {
					fg: 'green'
				},
				selected: {
					bg: 'blue',
					fg: 'white'
				},
				item: {
					hover: {
						bg: 'gray'
					}
				}
			},
			label: ' Select Mode (Use arrow keys, Enter to select) ',
			keys: true,
			mouse: true,
			vi: false,
			scrollable: false,
			alwaysScroll: false,
			tags: true,
			items: [
				'Live - Watch current live stream',
				'Time - Watch previous programming'
			]
		});

		// Instructions
		blessed.box({
			parent: modeDialog,
			bottom: 0,
			left: 1,
			width: '100%-2',
			height: 2,
			content: '{center}{bold}[↑↓] to navigate • [Enter] to select • [ESC] to cancel{/bold}{/center}',
			tags: true,
			style: {
				fg: 'cyan'
			}
		});

		modeList.focus();

		modeList.on('select', (_item: blessed.Widgets.BlessedElement, index: number) => {
			modeDialog.destroy();
			this.screen.render();

			switch (index) {
				case 0: // Live
					this.playChannel(channel);
					break;
				case 1: // Time
					this.showTimeInputDialog(channel);
					break;
			}
		});

		modeList.key(['escape'], () => {
			modeDialog.destroy();
			this.screen.render();
		});

		this.screen.render();
	}

	private showTimeInputDialog(channel: Channel): void {
		const timeDialog = blessed.box({
			parent: this.screen,
			top: 'center',
			left: 'center',
			width: '70%',
			height: '60%',
			border: {
				type: 'line'
			},
			style: {
				border: {
					fg: 'yellow'
				}
			},
			label: ` ${channel.name} - Enter Time Expression `,
			scrollable: true,
			tags: true
		});

		const timeInput = blessed.textbox({
			parent: timeDialog,
			top: 8,
			left: 2,
			width: '100%-4',
			height: 3,
			border: {
				type: 'line'
			},
			style: {
				border: {
					fg: 'blue'
				},
				focus: {
					border: {
						fg: 'cyan'
					}
				}
			},
			inputOnFocus: true,
			keys: true,
			vi: true
		});

		const exampleText = 
			`\n  Enter a time expression for previous programming:\n\n` +
			`  {bold}Examples:{/bold}\n` +
			`  • 2 hours ago\n` +
			`  • yesterday at 3pm\n` +
			`  • last friday 9am\n` +
			`  • 30 minutes ago\n` +
			`  • this morning at 8am\n\n` +
			`  {grey-fg}Press Enter to confirm, ESC to cancel{/grey-fg}`;

		timeDialog.setContent(exampleText);
		timeInput.focus();

		timeInput.on('submit', async (value: string) => {
			const timeExpression = value.trim();
			if (!timeExpression) {
				timeDialog.destroy();
				this.screen.render();
				return;
			}

			const parsedTime = TimeParser.parseTimeExpression(timeExpression);
			if (!parsedTime) {
				this.showError(`Invalid time expression: "${timeExpression}"\nUse natural language like "2 hours ago" or "yesterday 3pm"`);
				timeDialog.destroy();
				this.screen.render();
				return;
			}

			timeDialog.destroy();
			this.screen.render();
			
			await this.playChannelAtTime(channel, parsedTime);
		});

		timeInput.key(['escape'], () => {
			timeDialog.destroy();
			this.screen.render();
		});

		this.screen.render();
	}

	private async playChannelAtTime(channel: Channel, parsedTime: { timestamp: number; description: string }): Promise<void> {
		if (!this.token) {
			Logger.error('MAIN', 'No authentication token available');
			return;
		}

		try {
			// Check if mpv is available
			const mpvAvailable = await PlayerService.checkMpvAvailable();
			if (!mpvAvailable) {
				this.showError('MPV player not found. Please install mpv to play channels.');
				return;
			}

			// Hide the UI and start playback
			this.screen.destroy();
			
			// Start time-based channel playback and wait for it to complete
			Logger.info('MAIN', `Playing ${channel.name}: ${parsedTime.description}`);
			await this.playerService.playChannelAtTime(channel, this.token, parsedTime.timestamp);
			
			// Recreate the UI after playback ends
			this.screen = blessed.screen({
				smartCSR: true,
				title: 'Zapping TV'
			});
			this.setupKeyBindings();
			this.createMainUI();
			await this.loadChannels();
			
		} catch (error) {
			Logger.error('MAIN', 'Failed to play channel at time:', error);
			// Ensure UI is restored even on error
			this.screen = blessed.screen({
				smartCSR: true,
				title: 'Zapping TV'
			});
			this.setupKeyBindings();
			this.createMainUI();
			await this.loadChannels();
			this.showError(`Failed to play channel: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	private async playChannel(channel: Channel): Promise<void> {
		if (!this.token) {
			Logger.error('MAIN', 'No authentication token available');
			return;
		}

		try {
			// Check if mpv is available
			const mpvAvailable = await PlayerService.checkMpvAvailable();
			if (!mpvAvailable) {
				this.showError('MPV player not found. Please install mpv to play channels.');
				return;
			}

			// Hide the UI and start playback
			this.screen.destroy();
			
			// Start channel playback and wait for it to complete
			await this.playerService.playChannel(channel, this.token);
			
			// Recreate the UI after playback ends
			this.screen = blessed.screen({
				smartCSR: true,
				title: 'Zapping TV'
			});
			this.setupKeyBindings();
			this.createMainUI();
			await this.loadChannels();
			
		} catch (error) {
			Logger.error('MAIN', 'Failed to play channel:', error);
			// Ensure UI is restored even on error
			this.screen = blessed.screen({
				smartCSR: true,
				title: 'Zapping TV'
			});
			this.setupKeyBindings();
			this.createMainUI();
			this.showError(`Playback failed: ${error}`);
		}
	}

	private showError(message: string): void {
		const errorBox = blessed.message({
			parent: this.screen,
			top: 'center',
			left: 'center',
			width: '60%',
			height: '30%',
			border: {
				type: 'line'
			},
			style: {
				border: {
					fg: 'red'
				}
			},
			label: ' Error ',
			tags: true
		});

		errorBox.display(`\n{center}{bold}${message}{/bold}{/center}\n\n{center}Press any key to continue...{/center}`, () => {
			this.channelList?.focus();
		});
	}

	public async start(): Promise<void> {
		this.screen.render();
		
		try {
			// Check if mpv is available
			const mpvAvailable = await PlayerService.checkMpvAvailable();
			if (!mpvAvailable) {
				Logger.warn('MAIN', 'mpv player not found. Install mpv to play channels.');
			}

			// Check if we need to login
			if (!ConfigService.exists()) {
				this.token = await this.authService.authenticate(this.screen);
			} else {
				this.token = ConfigService.loadToken();
			}

			// Create main UI
			this.createMainUI();
			
			// Load channels
			await this.loadChannels();
		} catch (error: any) {
			Logger.error('MAIN', 'Application initialization failed:', error);
			Logger.error('MAIN', 'Error details:', {
				message: error.message,
				stack: error.stack,
				name: error.name
			});

			// Show detailed error message
			const errorMessage = error.message || 'Unknown initialization error';
			blessed.box({
				parent: this.screen,
				top: 'center',
				left: 'center',
				width: '80%',
				height: '60%',
				border: {
					type: 'line'
				},
				style: {
					border: {
						fg: 'red'
					}
				},
				label: ' Initialization Error ',
				content: 
					`\n  {red-fg}Failed to initialize application:{/red-fg}\n\n` +
					`  {bold}Error:{/bold} ${errorMessage}\n\n` +
					`  {grey-fg}Troubleshooting steps:{/grey-fg}\n` +
					`  {grey-fg}1. Check your internet connection{/grey-fg}\n` +
					`  {grey-fg}2. Verify you can access zappingtv.com{/grey-fg}\n` +
					`  {grey-fg}3. Try clearing config: rm ~/.config/zapping-node{/grey-fg}\n` +
					`  {grey-fg}4. Check detailed logs: ${Logger.getLogFilePath()}{/grey-fg}\n\n` +
					`  Press any key to exit...`,
				tags: true,
				scrollable: true
			});
			
			this.screen.render();
			
			// Wait for any key press
			this.screen.once('keypress', () => {
				this.quit();
			});
		}
	}

}

// CLI Interface
async function runCLI() {
	const program = new Command();
	
	program
		.name('zapping')
		.description('CLI to watch Zapping TV channels')
		.version('1.0.0')
		.option('-c, --channel <name>', 'channel name or number to play')
		.option('-t, --time <expression>', 'time expression for previous programming (e.g., "2 hours ago", "yesterday 3pm")')
		.option('-l, --list', 'list available channels')
		.option('-e, --examples', 'show examples of supported time expressions')
		.parse();

	const options = program.opts();

	// Clear previous log on startup
	Logger.clearLog();
	Logger.info('MAIN', 'Starting Zapping Node application');

	try {
		// Show time expression examples
		if (options['examples']) {
			console.log('Supported time expressions:');
			TimeParser.getExamples().forEach(example => {
				console.log(`  - ${example}`);
			});
			return;
		}

		// Initialize services for CLI mode
		const apiService = new ApiService();
		const authService = new AuthService(apiService);
		const playerService = new PlayerService();

		// Authenticate
		let token: string | null = null;
		if (!ConfigService.exists()) {
			console.log('Authentication required. Please visit the browser window to authenticate.');
			const authScreen = blessed.screen({
				smartCSR: true,
				title: 'Zapping Authentication'
			});
			token = await authService.authenticate(authScreen);
			authScreen.destroy();
		} else {
			token = ConfigService.loadToken();
		}

		if (!token) {
			console.error('Authentication failed');
			process.exit(1);
		}

		// Load channels
		const channelListResponse = await apiService.getChannelList(token);
		const channels = Object.values(channelListResponse.data).sort((a, b) => a.number - b.number);

		// List channels mode
		if (options['list']) {
			console.log('Available channels:');
			channels.forEach((channel) => {
				console.log(`  ${channel.number}: ${channel.name}`);
			});
			return;
		}

		// CLI playback mode
		if (options['channel']) {
			const channelQuery = options['channel'].toLowerCase();
			const channel = channels.find((ch) => 
				ch.name.toLowerCase().includes(channelQuery) || 
				ch.number.toString() === channelQuery
			);

			if (!channel) {
				console.error(`Channel not found: ${options['channel']}`);
				console.error('Use --list to see available channels');
				process.exit(1);
			}

			// Time-based playback
			if (options['time']) {
				const parsedTime = TimeParser.parseTimeExpression(options['time']);
				if (!parsedTime) {
					console.error(`Invalid time expression: ${options['time']}`);
					console.error('Use --examples to see supported formats');
					process.exit(1);
				}

				console.log(`Playing ${channel.name}: ${parsedTime.description}`);
				await playerService.playChannelAtTime(channel, token, parsedTime.timestamp);
			} else {
				// Live playback
				console.log(`Playing ${channel.name}: Live`);
				await playerService.playChannel(channel, token);
			}
			return;
		}

		// If no CLI options provided, start TUI mode
		const ui = new ZappingUI();
		await ui.start();

	} catch (error: any) {
		Logger.error('MAIN', 'Fatal error:', error);
		console.error('Error:', error.message);
		process.exit(1);
	}
}

if (require.main === module) {
	runCLI();
}

export default ZappingUI;