import * as blessed from 'blessed';
import { ApiService } from './api';
import { ConfigService } from './config';
import { Logger } from './logger';
import { API_ENDPOINTS } from '../constants';

export class AuthService {
	private api: ApiService;

	constructor(apiService: ApiService) {
		this.api = apiService;
	}

	async authenticate(screen: blessed.Widgets.Screen): Promise<string> {
		// Check if we have a saved token
		const savedToken = ConfigService.loadToken();
		if (savedToken) {
			Logger.info('AUTH', 'Using saved token from config');
			return savedToken;
		}

		Logger.info('AUTH', 'No saved token found, starting authentication process');

		// Create a login box
		const loginBox = blessed.box({
			parent: screen,
			top: 'center',
			left: 'center',
			width: '70%',
			height: '50%',
			border: {
				type: 'line',
			},
			style: {
				border: {
					fg: 'yellow',
				},
			},
			label: ' Zapping Login ',
			content: '\n  Getting activation code...',
			tags: true,
		});

		screen.render();

		try {
			Logger.info('AUTH', 'Step 1: Getting activation code');
			// Get activation code
			const code = await this.api.getActivationCode();
			Logger.info('AUTH', `Step 1 completed: Code ${code} obtained`);

			// Update the box with the code
			loginBox.setContent(
				`\n  {bold}Visit:{/bold} ${API_ENDPOINTS.SMART_TV_URL}\n\n` +
					`  {bold}Code:{/bold} {yellow-fg}${code}{/yellow-fg}\n\n` +
					`  Press {green-fg}[ENTER]{/green-fg} once you've entered the code...\n\n` +
					`  {grey-fg}Debug logs: ${Logger.getLogFilePath()}{/grey-fg}`
			);
			screen.render();

			Logger.info('AUTH', 'Step 2: Waiting for user to activate code on website');
			// Wait for user to press enter
			await new Promise<void>((resolve) => {
				const handler = (
					_ch: string,
					key: blessed.Widgets.Events.IKeyEventArg
				) => {
					if (key.name === 'return') {
						screen.unkey('return', handler);
						Logger.info(
							'AUTH',
							'Step 2 completed: User pressed ENTER'
						);
						resolve();
					}
				};
				screen.key('return', handler);
			});

			// Update status
			loginBox.setContent(
				'\n  Checking if code is linked...\n\n  {grey-fg}This may take a few seconds...{/grey-fg}'
			);
			screen.render();

			Logger.info('AUTH', 'Step 3: Checking if code is linked');
			// Check if code is linked
			const { status, token } = await this.api.checkCodeLinked(code);

			if (status === true && token) {
				Logger.info(
					'AUTH',
					'Step 3 completed: Code successfully linked, token received'
				);
				// Save token
				ConfigService.saveToken(token);
				Logger.info('AUTH', 'Token saved to config file');

				// Show success
				loginBox.setContent(
					'\n  {green-fg}✓ Login successful!{/green-fg}\n\n  {grey-fg}Token saved for future use{/grey-fg}'
				);
				loginBox.style.border.fg = 'green';
				screen.render();

				// Wait a moment before removing the box
				await new Promise((resolve) => global.setTimeout(resolve, 2000));

				// Remove login box
				screen.remove(loginBox);
				screen.render();

				return token;
			} else {
				Logger.error(
					'AUTH',
					`Step 3 failed: API returned status '${status}' instead of 'true'`
				);
				throw new Error(
					`Code linking failed: API returned status '${status}'. Make sure you activated the code on the website.`
				);
			}
		} catch (error: any) {
			Logger.error('AUTH', 'Authentication failed with error:', error);
			Logger.error('AUTH', 'Error stack:', error.stack);

			// Show detailed error
			const errorMessage = error.message || 'Unknown error occurred';
			loginBox.setContent(
				`\n  {red-fg}✗ Login failed:{/red-fg}\n\n` +
					`  {red-fg}${errorMessage}{/red-fg}\n\n` +
					`  {grey-fg}Possible causes:{/grey-fg}\n` +
					`  {grey-fg}- Code not activated on website{/grey-fg}\n` +
					`  {grey-fg}- Network connectivity issues{/grey-fg}\n` +
					`  {grey-fg}- Code expired (try again){/grey-fg}\n\n` +
					`  {grey-fg}Detailed logs: ${Logger.getLogFilePath()}{/grey-fg}\n\n` +
					`  Press any key to exit...`
			);
			loginBox.style.border.fg = 'red';
			screen.render();

			// Wait for any key press
			await new Promise((resolve) => {
				const handler = () => {
					screen.unkey('keypress', handler);
					resolve(undefined);
				};
				screen.on('keypress', handler);
			});

			// Remove login box and exit
			screen.remove(loginBox);
			screen.render();

			throw error;
		}
	}
}
