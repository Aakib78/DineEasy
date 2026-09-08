import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';

class TaxComponentInput {
  @IsIn(['CGST', 'SGST', 'IGST', 'SERVICE_CHARGE'])
  taxType!: 'CGST' | 'SGST' | 'IGST' | 'SERVICE_CHARGE';

  @IsNumber()
  @Min(0)
  @Max(100)
  ratePercent!: number;
}

export class CreateTaxGroupDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TaxComponentInput)
  components!: TaxComponentInput[];
}
