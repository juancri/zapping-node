export const CONFIG_FILE = `${process.env['HOME']}/.config/zapping-node`;
export const USER_AGENT = 'Zapping/node-1.0';

export const API_ENDPOINTS = {
	ACTIVATION_GET_CODE: 'https://meteoro.zappingtv.com/activation/V30/androidtv/getcode',
	ACTIVATION_CHECK_LINKED: 'https://meteoro.zappingtv.com/activation/V30/androidtv/linked',
	DRHOUSE_LOGIN: 'https://drhouse.zappingtv.com/login/V30/androidtv/',
	DRHOUSE_HEARTBEAT: 'https://drhouse.zappingtv.com/hb/V30/androidtv/',
	CHANNEL_LIST: 'https://alquinta.zappingtv.com/v31/androidtv/channelswithurl/',
	SMART_TV_URL: 'https://app.zappingtv.com/smart'
};