import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

// v1 still has no way to edit an individual TaxGroupComponent (rate/type) after creation — only
// name and isActive are covered here. Changing a live tax rate on an outlet mid-operation is a
// real enough decision (it doesn't affect past orders/invoices, which snapshot their own totals,
// but changes every *future* order using this group) that it's left as "deactivate the old group,
// create a new one" for now rather than an in-place rate edit — see docs/database.md.
export class UpdateTaxGroupDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
