import { IsString, MinLength } from 'class-validator';

export class CreateKitchenStationDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
