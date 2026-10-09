import { ServerConnections } from 'lib/jellyfin-apiclient';

export async function homeflixApi(path, body, options = {}) {
    const client = options.client || ServerConnections.currentApiClient();
    const token = options.token || client?.accessToken();
    const response = await fetch('/homeflix-api/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        headers: { 'X-Homeflix-Token': token || '', 'X-Homeflix-Request': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: options.signal || AbortSignal.timeout(60000)
    });
    const data = await response.json();
    if (!response.ok) {
        const error = new Error(data.message || 'HomeFlix is temporarily unavailable.');
        error.status = response.status;
        error.retryAfter = data.retryAfter || 0;
        throw error;
    }
    return data;
}

export async function connectRequests(username, password, token, client) {
    try {
        await homeflixApi('requests/login', { username, password }, { token, client, signal: AbortSignal.timeout(15000) });
        sessionStorage.removeItem('homeflix.requests.error');
    } catch (error) {
        sessionStorage.setItem('homeflix.requests.error', error.message);
    }
}
