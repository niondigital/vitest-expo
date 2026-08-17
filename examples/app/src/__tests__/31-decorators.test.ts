/**
 * Legacy (TypeScript `experimentalDecorators`) decorators in app code —
 * babel-preset-expo enables them by default; under Vitest the transform kicks
 * in once tsconfig sets `experimentalDecorators: true` (which decorator-using
 * projects already need for type-checking).
 */
function tag(target: any) {
	(target as any).tagged = true;
}

function logged(_target: any, _key: string, desc: PropertyDescriptor) {
	const orig = desc.value;
	desc.value = function (...args: any[]) {
		return `logged:${orig.apply(this, args)}`;
	};
	return desc;
}

@tag
class Service {
	@logged
	greet(name: string) {
		return `hi ${name}`;
	}
}

describe('legacy decorators', () => {
	it('applies class and method decorators', () => {
		expect((Service as any).tagged).toBe(true);
		expect(new Service().greet('x')).toBe('logged:hi x');
	});
});
