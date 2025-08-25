export interface GetCodeResponse {
	status: string;
	data: {
		code: string;
	};
}

export interface CheckLinkedResponse {
	status: boolean;
	data: {
		data: string; // This is the token
	};
}

export interface DrHouseLoginResponse {
	status: string;
	data: {
		playToken: string;
	};
}

export interface Channel {
	number: number;
	name: string;
	url: string;
	image: string;
}

export interface ChannelListResponse {
	data: Record<string, Channel>;
}