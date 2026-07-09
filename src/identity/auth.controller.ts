import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService, LoginResponse, PublicUserResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const AUTH_THROTTLE_TTL_MS = Number(process.env.AUTH_THROTTLE_TTL_MS ?? 60_000);
const AUTH_THROTTLE_LIMIT = Number(process.env.AUTH_THROTTLE_LIMIT ?? 5);

@ApiTags('identity')
@Controller('auth')
@Throttle({
  default: { limit: AUTH_THROTTLE_LIMIT, ttl: AUTH_THROTTLE_TTL_MS },
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a user inside a brand tenant' })
  @ApiResponse({ status: 201, description: 'User registered' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  @ApiResponse({ status: 409, description: 'User already exists in brand' })
  async register(@Body() body: RegisterDto): Promise<PublicUserResponse> {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create a server-side session and return opaque token',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() body: LoginDto): Promise<LoginResponse> {
    return this.authService.login(body);
  }
}
