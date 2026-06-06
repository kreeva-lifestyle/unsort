declare module 'qz-tray' {
  const qz: {
    websocket: {
      connect(opts?: Record<string, unknown>): Promise<void>;
      disconnect(): Promise<void>;
      isActive(): boolean;
    };
    printers: {
      find(query?: string): Promise<string | string[]>;
    };
    configs: {
      create(printer: string, opts?: Record<string, unknown>): unknown;
    };
    print(config: unknown, data: unknown[]): Promise<void>;
    security: {
      setCertificatePromise(fn: (resolve: (cert: string) => void) => void): void;
      setSignatureAlgorithm(algo: string): void;
      setSignaturePromise(fn: (toSign: string) => (resolve: (sig: string) => void, reject: (err: unknown) => void) => void): void;
    };
  };
  export default qz;
}
