export function promisify(callback) {
  return (...args) =>
    new Promise((resolve, reject) => {
      callback(...args, (error, value) => (error ? reject(error) : resolve(value)));
    });
}
