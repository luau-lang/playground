-- regular comment
--[=[
long comment with [=[ nested text
]=]

export type Result<T> = { ok: boolean, value: T? }

type Pair<T, U = string> = { first: T, second: U }

type function Mapper<T, U>(value: T): U

local function make<T>(value: T): T
  return value
end

local function returnsNothing()
  return
end

local function packer<T...>(...: T...): T...
  return ...
end

local function returnsTuple(): (number, string, ...boolean)
  return 1, "ok", true
end

-- highlighting corpus
local number = 10
local type = "identifier"
local continue = 42

local function makeFoo<T>(bar: number, ...: T): T
  return bar
end

local made = makeFoo(1)

type Vec2 = { read x: number, write y: string }
export type Alias<T> = Vec2

type Callback = (x: number, y: string) -> number

local typed: typeof(number) = number
local casted = number :: Vec2

number += 5
number //= 2
number ..= "!"

local msg = `value is {number}, next is {number + 1}`
local empty = ``

local long = [=[line one
line two]=]

for i = 1, 10 do
  if i % 2 == 0 then
    continue
  end
end

for _, n in numbers do
  sum += n
end

local t = { a = 1, [2] = 3 }
