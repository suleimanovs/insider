# Decompose: Save State

### Введение

Это продолжение четерех предыдущих статей.

1. В первой мы разобрали, где в конечном итоге хранится `ViewModelStore` в случае с `Activity`,
2. Во второй — как это устроено во `Fragment`,
3. В третьей где хранятся `ViewModel`-и, когда мы используем **Compose** (или даже просто `View`).
4. В четвертой выяснили работу методов onSaveInstanceState/onRestoreInstanceState, Saved State Api, и то где хранится Bundle

То в этой статье мы поймем как нашумевшая библиотека Decompose справляется без ViewModel и методов onSaveInstanceState,
так как она является кроссплатформенной(KMP) библиотекой.

В статье не будет описания как работать с этими Api, а будет о том как они работают изнутри, по этому я буду пологаться на то
что вы уже работали с ними или хотя бы знакомы и имеете общее представление.
Как всегда начнем с базиса, давайте сначала дадим определения для Decompose:

### Базис

**Decompose** — это мультиплатформенная библиотека для разделения бизнес-логики и UI которая была разработана Аркадием Ивановым. Она работает поверх `ComponentContext`, который
управляет жизненным циклом, состоянием и навигацией между компонентами.

Поддерживает Android, iOS, JS, JVM, macOS, watchOS, tvOS.

Зачем использовать:

* логика отделена от UI и легко тестируется
* работает с Compose, SwiftUI, React и др.
* навигация и состояние — кроссплатформенные
* компоненты переживают конфигурационные изменения (как ViewModel)
* можно расширять и кастомизировать `ComponentContext` под свои задачи

Decompose — это не фреймворк, а мощный инструмент, на котором можно построить свой Api. Кратко говоря это швейцарский нож.

В Android сложно представить приложение без стандартной ViewModel-и, и то что в Decompose ее нет, но она умеет хранить данные как при
измненеия конфигруаций так и при уничтожений процесса удивляет. Давайте быстро узнаем про сущности которыми основывается Decompose:

У Decompose все крутится вокруг `ComponentContext` который из себя прелставляет некий компонент сваязанный с определенным экраном или
набором дочерних компонентов. У каждого компонента есть связанный с ним `ComponentContext`, который реализует следующие интерфейсы:

* **LifecycleOwner** — предоставляется библиотекой Essenty, даёт каждому компоненту собственный жизненный цикл
* **StateKeeperOwner** — позволяет сохранять любое состояние при конфигурационных изменениях и/или смерти процесса
* **InstanceKeeperOwner** — даёт возможность сохранять любые объекты внутри компонента (аналог `ViewModel` в AndroidX)
* **BackHandlerOwner** — позволяет каждому компоненту обрабатывать нажатие кнопки «назад»

Основное внимание мы уделим именно StateKeeperOwner и  InstanceKeeperOwner, как мы видим они на самом деле тянутся из библиотеки 
Essenty которая так же была создана Акркадием Ивановым, но особое применение это библиотека получила именно в Decompose,
Начнем углубляться в работу StateKeeperOwner, буду полагаться на то что вы уже читали предыдущие статьи, давайте начнем

## StateKeeperOwner

Что бы понять его работу, давайте сделаем очень простой экран Counter, цель в том что бы увидеть как Counter умеет переживать
изменение конфигураций и смерть процесса, начнем с создания Component:
```kotlin

class DefaultCounterComponent(
    componentContext: ComponentContext
) : ComponentContext by componentContext {

    val model: StateFlow<Int> field = MutableStateFlow(stateKeeper.consume(KEY, Int.serializer()) ?: 0)

    init {
        stateKeeper.register(KEY, Int.serializer()) { model.value }
    }

    fun increase() {
        model.value++
    }

    fun decrease() {
        model.value--
    }

    companion object {
        private const val KEY = "counter_state"
    }
}
```
Довольно простоая логика, у нас есть model который хранит в себе счетчик, есть две методы для изменения счетчика, и есть 
StateKeeper, из которого мы получает значение при инициализаций при обьявлений переменной, если там пусто, то мы по умолчанию тспользуем 0

Так же в init блоке мы инициализируем регистратор, который в лямбде обращается к model и получает данные счетчика, далее ui экран
который работает с DefaultCounterComponent
```kotlin
@Composable
fun CounterScreen(component: DefaultCounterComponent) {
    val count by component.model.collectAsState()

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = count.toString(), style = MaterialTheme.typography.headlineLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Button(onClick = { component.decrease() }) { Text("-", fontSize = 20.sp) }
            Button(onClick = { component.increase() }) { Text("+", fontSize = 20.sp) }
        }
    }
}
```

И сама активити для инициализаций ComponentContext, и вызов COmposable экрана  CounterScreen:
```kotlin
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val counterComponent = DefaultCounterComponent(defaultComponentContext())
        setContent { CounterScreen(component = counterComponent) }
    }
}
```