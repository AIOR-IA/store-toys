import { Injectable } from '@angular/core';

import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

import {
    SocketChannel,
    UserSynchronizationChannel,
} from '@core/types/websocket';
import { environment } from 'environments/environment';

@Injectable({
    providedIn: 'root',
})
export class WebsocketService {
    private socket: Socket;

    constructor() {
        const host = environment.API_URL.replace('/api', '');
        this.socket = io(host, { path: '/api/socket.io' });
        this.socket.on('connect', () => {
            console.log('Connected to websocket');
        });
    }

    public getMessages(name: UserSynchronizationChannel | SocketChannel) {
        const observable = new Observable<any>((observer) => {
            this.socket.on(name, (data: any) => {
                observer.next(data);
            });
            return () => {
                this.socket.disconnect();
            };
        });
        return observable;
    }

    public listenToChannel(name: UserSynchronizationChannel | SocketChannel) {
        return new Observable<any>((observer) => {
            const handler = (data: any) => {
                observer.next(data);
            };

            this.socket.on(name, handler);

            return () => {
                this.socket.off(name, handler);
            };
        });
    }

    disconnect() {
        this.socket.disconnect();
    }
}
