import { NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { CreateDeviceSchema } from '@/shared/types/device';

export async function POST(request: Request) {
  try {
    // 1. Parse and validate request
    const body = await request.json();
    const validatedData = CreateDeviceSchema.parse(body);
    
    // 2. Generate proper UUID
    const deviceId = uuidv4();
    
    // 3. Return response with valid UUID
    return NextResponse.json({
      success: true,
      message: 'Device created',
      data: {
        device_id: deviceId,
        ...validatedData,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    console.error('Create device error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    return NextResponse.json({
      success: true,
      data: [],
    });
  } catch (error) {
    console.error('Get devices error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
