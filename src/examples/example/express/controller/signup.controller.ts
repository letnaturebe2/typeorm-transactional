import type { Request, Response } from 'express';
import type { SignupService } from '../../../service/signup.service';

export interface SignupRequest {
  organizationId: string;
  userId: string;
  userName: string;
}

export class SignupController {
  constructor(private readonly signupService: SignupService) {}

  async signup(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, userId, userName } = req.body as SignupRequest;

      if (!organizationId || !userId || !userName) {
        res.status(400).json({
          error: 'Missing required fields: organizationId, userId, userName',
        });
        return;
      }

      const result = await this.signupService.signup({
        organizationId,
        userId,
        userName,
      });

      res.status(201).json({
        success: true,
        data: {
          organization: {
            organizationId: result.organization.organizationId,
            createdAt: result.organization.createdAt,
          },
          user: {
            userId: result.user.userId,
            name: result.user.name,
            createdAt: result.user.createdAt,
          },
        },
      });
    } catch (error) {
      console.error('Signup failed:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async signupWithoutTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, userId, userName } = req.body as SignupRequest;

      if (!organizationId || !userId || !userName) {
        res.status(400).json({
          error: 'Missing required fields: organizationId, userId, userName',
        });
        return;
      }

      const result = await this.signupService.signupWithoutTransaction({
        organizationId,
        userId,
        userName,
      });

      res.status(201).json({
        success: true,
        data: {
          organization: {
            organizationId: result.organization.organizationId,
            createdAt: result.organization.createdAt,
          },
          user: {
            userId: result.user.userId,
            name: result.user.name,
            createdAt: result.user.createdAt,
          },
        },
      });
    } catch (error) {
      console.error('Signup without transaction failed:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
