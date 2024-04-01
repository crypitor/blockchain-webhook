import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type BlockSyncDocument = HydratedDocument<BlockSync>;

@Schema()
export class BlockSync {
  @Prop({ required: true, unique: true, lowercase: true, index: true })
  rpcUrl: string;

  @Prop({ default: 'ETH' })
  chain: string;

  @Prop()
  lastSync: number;

  @Prop({ default: Date.now() })
  dateCreated: Date;
}

export const BlockSyncSchema = SchemaFactory.createForClass(BlockSync);
