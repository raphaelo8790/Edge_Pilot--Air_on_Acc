import {
  assessHardwareFit,
  HardwareObservation,
} from '../../src/modules/benchmark/core/services/HardwareFitAssessor';

const GB = 1_000_000_000;

function observation(
  overrides: Partial<HardwareObservation> = {}
): HardwareObservation {
  return {
    modelBytesOnDisk: 2.02 * GB,
    residentBytes: 2.55 * GB,
    vramBytes: 2.55 * GB,
    ...overrides,
  };
}

describe('assessHardwareFit', () => {
  it('does not apply to a cloud provider, and says why', () => {
    const result = assessHardwareFit('cloud', observation());

    expect(result.score).toBeNull();
    expect(result.state).toBe('NOT_APPLICABLE');
    expect(result.limitations.join(' ')).toContain('provider’s hardware');
  });

  it('returns null when the runtime reported nothing', () => {
    expect(assessHardwareFit('local', null).state).toBe('NOT_OBSERVED');
    expect(
      assessHardwareFit('local', observation({ residentBytes: null })).score
    ).toBeNull();
    expect(
      assessHardwareFit('local', observation({ residentBytes: 0 })).state
    ).toBe('NOT_OBSERVED');
  });

  it('scores a model fully resident in VRAM at 100', () => {
    // These are the real figures read off llama3.2:latest during a live run.
    const result = assessHardwareFit('local', observation());

    expect(result.state).toBe('FITS_GPU');
    expect(result.score).toBe(100);
    expect(result.vramFraction).toBeCloseTo(1, 3);
  });

  it('scales a partially offloaded model by how much actually fitted', () => {
    const half = assessHardwareFit(
      'local',
      observation({ vramBytes: 1.275 * GB })
    );
    const most = assessHardwareFit(
      'local',
      observation({ vramBytes: 2.3 * GB })
    );

    expect(half.state).toBe('PARTIAL_OFFLOAD');
    expect(most.score!).toBeGreaterThan(half.score!);
    expect(half.limitations.join(' ')).toContain('50% of the model');
  });

  it('does not double-punish CPU execution, because latency already measures it', () => {
    const result = assessHardwareFit('local', observation({ vramBytes: 0 }));

    expect(result.state).toBe('CPU_ONLY');
    expect(result.score).toBe(50);
    expect(result.limitations.join(' ')).toContain('not counted twice');
  });

  it('treats unreported GPU residency as CPU execution and says so', () => {
    const result = assessHardwareFit('local', observation({ vramBytes: null }));

    expect(result.state).toBe('CPU_ONLY');
    expect(result.limitations.join(' ')).toContain('GPU residency was not reported');
  });

  it('says how much VRAM a fully resident model took, and that nothing spilled', () => {
    const result = assessHardwareFit(
      'local',
      observation({ residentBytes: 2 * GB, vramBytes: 2 * GB })
    );

    expect(result.vramBytes).toBe(2 * GB);
    expect(result.spilledBytes).toBe(0);
    expect(result.summary).toContain('2.00 GB of VRAM');
    expect(result.summary).toContain('Nothing spilled');
  });

  it('reports the VRAM taken and the exact bytes that spilled', () => {
    // size_vram and size are both measured, so the spill is a subtraction of
    // two measurements - not an estimate from the model's file size.
    const result = assessHardwareFit(
      'local',
      observation({ residentBytes: 4 * GB, vramBytes: 3 * GB })
    );

    expect(result.state).toBe('PARTIAL_OFFLOAD');
    expect(result.vramBytes).toBe(3 * GB);
    expect(result.spilledBytes).toBe(1 * GB);
    expect(result.summary).toContain('3.00 GB of the model sat in GPU memory');
    expect(result.summary).toContain('1.00 GB did not fit');
    expect(result.summary).toContain('25% of the model spilled');
  });

  it('refuses to express VRAM use as a share of the card', () => {
    // Ollama reports what the model took, never what the GPU has.
    const result = assessHardwareFit('local', observation());

    expect(result.limitations.join(' ')).toContain('not how much the GPU has');
  });

  it('leaves spilled bytes unknown rather than zero when no GPU figure is reported', () => {
    const result = assessHardwareFit('local', observation({ vramBytes: null }));

    expect(result.vramBytes).toBeNull();
    expect(result.spilledBytes).toBeNull();
  });

  it('scores placement only, whatever the host machine has', () => {
    // Total system RAM used to be an input here and could remove 20 points
    // for tight headroom. It came from os.totalmem() - the SERVER's memory,
    // not the machine running the model - or from a figure the user typed
    // into a form. Both were removed. A model fully resident in GPU memory
    // scores 100 regardless of anything about the host.
    const enormous = assessHardwareFit(
      'local',
      observation({ residentBytes: 40 * GB, vramBytes: 40 * GB })
    );
    const modest = assessHardwareFit('local', observation());

    expect(enormous.state).toBe('FITS_GPU');
    expect(enormous.score).toBe(100);
    expect(enormous.score).toBe(modest.score);
  });
});
