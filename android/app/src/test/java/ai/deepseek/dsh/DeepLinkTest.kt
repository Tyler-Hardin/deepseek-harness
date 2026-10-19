package ai.deepseek.dsh

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Notification deep links: the page address and the deployment they select. */
class DeepLinkTest {

    private fun book(vararg servers: ServerEntry) = ServerBook(servers.toList(), servers.firstOrNull()?.id)

    private fun entry(id: String, url: String) = ServerEntry(id, id, url, null)

    @Test
    fun `appends the session query to a bare server URL`() {
        assertEquals("https://dsh.example/?session=abc", sessionUrl("https://dsh.example", "abc"))
        assertEquals("https://dsh.example/?session=abc", sessionUrl("https://dsh.example/", "abc"))
    }

    @Test
    fun `keeps an existing query and the fragment`() {
        assertEquals("https://dsh.example/?tab=1&session=abc", sessionUrl("https://dsh.example/?tab=1", "abc"))
        assertEquals("https://dsh.example/?session=abc#chat", sessionUrl("https://dsh.example/#chat", "abc"))
    }

    @Test
    fun `escapes a session id that needs it`() {
        assertEquals("https://dsh.example/?session=a%26b", sessionUrl("https://dsh.example/", "a&b"))
    }

    @Test
    fun `selects the deployment whose origin matches`() {
        val personal = entry("personal", "https://dsh.example/")
        val work = entry("work", "https://work.example:8443")
        val current = book(personal, work)
        assertEquals(personal, serverForOrigin(current, "https://dsh.example"))
        assertEquals(work, serverForOrigin(current, "https://work.example:8443/"))
    }

    @Test
    fun `treats a different port, scheme, or host as another deployment`() {
        val current = book(entry("work", "https://work.example:8443"))
        assertNull(serverForOrigin(current, "https://work.example"))
        assertNull(serverForOrigin(current, "http://work.example:8443"))
        assertNull(serverForOrigin(current, "https://other.example:8443"))
        assertNull(serverForOrigin(current, "not a url"))
    }
}
