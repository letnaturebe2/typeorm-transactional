import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { NestJSSignupService } from '../service/signup.service';

export interface SignupRequest {
  organizationId: string;
  userId: string;
  userName: string;
}

export interface SignupResponse {
  success: boolean;
  data: {
    organization: {
      organizationId: string;
      createdAt: Date;
    };
    user: {
      userId: string;
      name: string | null;
      createdAt: Date;
    };
  };
}

@Controller('signup')
export class NestJSSignupController {
  constructor(private readonly signupService: NestJSSignupService) {}

  @Post()
  async signup(@Body() body: SignupRequest): Promise<SignupResponse> {
    const { organizationId, userId, userName } = body;

    try {
      const result = await this.signupService.signup({
        organizationId,
        userId,
        userName,
      });

      return {
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
      };
    } catch (error) {
      console.error('NestJS Signup failed:', error);
      throw new HttpException(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('without-transaction')
  async signupWithoutTransaction(
    @Body() body: SignupRequest,
  ): Promise<SignupResponse> {
    const { organizationId, userId, userName } = body;

    try {
      const result = await this.signupService.signupWithoutTransaction({
        organizationId,
        userId,
        userName,
      });

      return {
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
      };
    } catch (error) {
      console.error('NestJS Signup without transaction failed:', error);
      throw new HttpException(
        {
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
