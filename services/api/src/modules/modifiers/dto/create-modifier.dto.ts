import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

/** Adds one modifier to an existing group — the array-only `CreateModifierGroupDto.modifiers`
 * only covers modifiers set at group-creation time; this is the endpoint that was missing for
 * adding one afterwards (e.g. a new topping to an existing "Toppings" group). */
export class CreateModifierDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsNumber()
  priceDelta?: number;
}
