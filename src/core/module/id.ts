const prefix = "@lumelabs/react-di"

const getId = (() => {
    let i = 0
    return () => `${i++}`
})()

export const id = () => {
    return `${prefix}:${getId()}`
}
