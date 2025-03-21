export interface ICommunicationProvider {
    connect(): void;
    disconnect(): void;
    sendUpdate(message: any): void;
    onUpdate(callback: (update: any) => void): void;
} 