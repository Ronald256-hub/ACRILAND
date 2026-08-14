declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        organizationId: string;
        sessionId: string;
        permissions: Set<string>;
        roles: string[];
      };
    }
  }
}
export {};
