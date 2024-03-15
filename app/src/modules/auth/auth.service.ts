import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { comparePassword } from 'src/utils/bcrypt.util';
import { LoginResponseDto } from './dto/login.reponse.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, pass: string): Promise<User> {
    const user = await this.usersService.findOne(email);
    if (user && (await comparePassword(pass, user.password))) {
      return user;
    }
    return null;
  }

  async login(user: User): Promise<LoginResponseDto> {
    const payload = {
      userId: user.userId,
      email: user.email,
    };
    return new LoginResponseDto(this.jwtService.sign(payload));
  }
}
