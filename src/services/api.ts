import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';
import { USER_AGENT, API_ENDPOINTS } from '../constants';
import { Logger } from './logger';
import {
	GetCodeResponse,
	CheckLinkedResponse,
	DrHouseLoginResponse,
	ChannelListResponse,
} from '../types';

export class ApiService {
	private axiosInstance: AxiosInstance;
	private uuid: string;

	constructor() {
		this.uuid = randomUUID();
		this.axiosInstance = axios.create({
			headers: {
				'User-Agent': USER_AGENT,
				'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			},
			// Ignore SSL certificate verification like the bash script
			httpsAgent: new (require('https').Agent)({
				rejectUnauthorized: false,
			}),
		});
	}

	getUUID(): string {
		return this.uuid;
	}

	async getActivationCode(): Promise<string> {
		try {
			Logger.info('API', `Requesting activation code for UUID: ${this.uuid}`);
			const response = await this.axiosInstance.post<GetCodeResponse>(
				API_ENDPOINTS.ACTIVATION_GET_CODE,
				new global.URLSearchParams({
					uuid: this.uuid,
					acquisition: 'Android TV',
				})
			);

			Logger.info('API', `Activation code response status: ${response.status}`);
			Logger.info('API', `Activation code received: ${response.data.data.code}`);
			return response.data.data.code;
		} catch (error: any) {
			if (error.response) {
				Logger.error(
					'API',
					`HTTP Error ${error.response.status}: ${error.response.statusText}`
				);
				Logger.error('API', 'Response data:', error.response.data);
				throw new Error(
					`Failed to get activation code - HTTP ${error.response.status}: ${error.response.data?.message || error.response.statusText}`
				);
			} else if (error.request) {
				Logger.error('API', 'Network error - no response received');
				throw new Error(
					`Network error: Could not connect to ${API_ENDPOINTS.ACTIVATION_GET_CODE}`
				);
			} else {
				Logger.error('API', 'Request setup error:', error.message);
				throw error;
			}
		}
	}

	async checkCodeLinked(code: string): Promise<{ status: boolean; token: string }> {
		try {
			Logger.info('API', `Checking if code ${code} is linked...`);
			const response = await this.axiosInstance.post<CheckLinkedResponse>(
				API_ENDPOINTS.ACTIVATION_CHECK_LINKED,
				new global.URLSearchParams({
					code: code,
				})
			);

			Logger.info('API', `Response status: ${response.status}`);
			Logger.debug('API', 'Response data:', response.data);

			if (response.data.status !== true) {
				Logger.error(
					'API',
					`Code linking failed. Status: ${response.data.status}`
				);
				throw new Error(`API returned status: ${response.data.status}`);
			}

			if (!response.data.data || !response.data.data.data) {
				Logger.error('API', 'No token received in response');
				throw new Error('No token received from server');
			}

			Logger.info('API', 'Code successfully linked, token received');
			return {
				status: response.data.status,
				token: response.data.data.data,
			};
		} catch (error: any) {
			if (error.response) {
				Logger.error(
					'API',
					`HTTP Error ${error.response.status}: ${error.response.statusText}`
				);
				Logger.error('API', 'Response data:', error.response.data);
				throw new Error(
					`HTTP ${error.response.status}: ${error.response.data?.message || error.response.statusText || 'Unknown server error'}`
				);
			} else if (error.request) {
				Logger.error('API', 'Network error - no response received');
				Logger.error('API', 'Request config:', error.config?.url);
				throw new Error(
					`Network error: Could not connect to ${API_ENDPOINTS.ACTIVATION_CHECK_LINKED}`
				);
			} else {
				Logger.error('API', 'Request setup error:', error.message);
				throw error;
			}
		}
	}

	async getDrHousePlayToken(token: string): Promise<string> {
		const response = await this.axiosInstance.post<DrHouseLoginResponse>(
			API_ENDPOINTS.DRHOUSE_LOGIN,
			new global.URLSearchParams({
				token: token,
				uuid: this.uuid,
			})
		);

		return response.data.data.playToken;
	}

	async sendHeartbeat(playToken: string): Promise<void> {
		await this.axiosInstance.post(
			API_ENDPOINTS.DRHOUSE_HEARTBEAT,
			new global.URLSearchParams({
				playtoken: playToken,
				uuid: this.uuid,
				deviceInfo: '{}',
			})
		);
	}

	async getChannelList(token: string): Promise<ChannelListResponse> {
		const response = await this.axiosInstance.post<ChannelListResponse>(
			API_ENDPOINTS.CHANNEL_LIST,
			new global.URLSearchParams({
				quality: 'auto',
				hevc: '0',
				is3g: '0',
				token: token,
			})
		);

		return response.data;
	}
}
