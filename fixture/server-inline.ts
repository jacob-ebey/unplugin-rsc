export function hasSub(name: string) {
	const sayHello = () => {
		"use server";
		return `Hello, ${name}!`;
	};
	return sayHello;
}
