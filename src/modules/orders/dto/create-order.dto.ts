import { IsString, IsInt, Min, IsNotEmpty } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  product: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
